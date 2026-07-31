/**
 * Thin hand-rolled wrapper around an OpenAI-compatible `/chat/completions` endpoint (Ollama in
 * dev, per env vars below). No SDK, no framework — native `fetch` only, per this repo's "no
 * unnecessary dependencies" rule. The model never sees tenant data beyond what the orchestrator
 * explicitly passes it in `messages`.
 */

const LLM_BASE_URL = process.env.LLM_BASE_URL ?? 'http://localhost:11434/v1';
const LLM_MODEL = process.env.LLM_MODEL ?? 'qwen2.5:7b-instruct';

export interface LlmChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** JSON-schema-only tool description — name/description/args shape, never data. Safe to always
 *  expose to the model regardless of the viewer's permissions (the executor enforces those). */
export interface LlmToolSchema {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface LlmToolCall {
  id: string;
  function: { name: string; arguments: string };
}

interface ChatCompletionResponse {
  choices: Array<{ message: { content: string | null; tool_calls?: LlmToolCall[] } }>;
}

async function chatCompletion(body: Record<string, unknown>): Promise<ChatCompletionResponse> {
  const res = await fetch(`${LLM_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: LLM_MODEL, ...body }),
  });
  if (!res.ok) {
    throw new Error(`LLM request failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as ChatCompletionResponse;
}

/**
 * Tool-selection call: gives the model the conversation plus the full static tool registry and
 * asks it to pick at most one. Returns the first tool call the model proposes, or `null` if it
 * proposed none — the orchestrator treats `null` as a decline and never calls the model again for
 * this turn.
 */
export async function selectTool(
  messages: LlmChatMessage[],
  tools: LlmToolSchema[],
): Promise<LlmToolCall | null> {
  const response = await chatCompletion({
    messages,
    tools: tools.map((tool) => ({
      type: 'function',
      function: { name: tool.name, description: tool.description, parameters: tool.parameters },
    })),
    tool_choice: 'auto',
    // Verified live: at the model's default sampling temperature, an ambiguous relative-date
    // question ("tomorrow or later this week") picked the wrong `range` 3 of 4 runs (defaulting to
    // "today", missing the rest of the week) — greedy decoding (temperature 0) picked correctly
    // 4/4 on that same question and didn't regress the other tested phrasings. Classification/
    // argument-extraction wants determinism, not creativity.
    temperature: 0,
  });
  return response.choices[0]?.message.tool_calls?.[0] ?? null;
}

/**
 * Narration call: a plain chat completion (no tools) asking for a short plain-language answer
 * grounded only in the structured facts already placed in `messages` by the orchestrator.
 */
export async function narrate(messages: LlmChatMessage[]): Promise<string> {
  // Verified live: at default sampling temperature, matching a question's relative date
  // ("tomorrow") against several same-day-adjacent rows in the supplied JSON produced the wrong
  // answer 1 of 3 runs (claiming no matching record when one was present) — temperature 0 was 3/3
  // correct on the identical payload. Grounded fact-extraction over provided data wants
  // determinism, same reasoning as `selectTool`'s temperature setting above.
  const response = await chatCompletion({ messages, temperature: 0 });
  return response.choices[0]?.message.content ?? '';
}

const MEMORY_EXTRACTION_SYSTEM_PROMPT =
  'You are the smartEnterprise assistant\'s long-term memory extractor. Given a snippet of a ' +
  "conversation and the facts already remembered about this user, decide whether the snippet " +
  'reveals any NEW, durable fact or preference about the user worth remembering for future ' +
  'conversations (stated preferences, recurring context, role, working style). Never invent a ' +
  'fact that is not clearly stated. Never propose anything already covered by an existing memory. ' +
  'Never propose one-off situational details (a specific date, a specific request\'s status). ' +
  'Respond with ONLY a JSON array of short fact strings, one per new memory — respond with [] if ' +
  'nothing new and durable was revealed.';

/**
 * Long-term-memory extraction call: a plain chat completion (no tools) that looks at a
 * conversation snippet plus what's already remembered about the user and proposes new,
 * durable facts worth storing. Same "no model arithmetic/no guessing" determinism reasoning as
 * `selectTool`/`narrate` above — temperature 0, since this is a classification task, not a
 * creative one. The caller (memory.service.ts) decides when to invoke this and how to persist
 * the result; this function only shapes the request and parses the response.
 */
export async function extractMemories(turns: LlmChatMessage[], existingMemories: string[]): Promise<string[]> {
  const existingBlock = existingMemories.length
    ? `Already remembered about this user:\n${existingMemories.map((m) => `- ${m}`).join('\n')}`
    : 'Nothing is remembered about this user yet.';
  const conversationBlock = turns.map((t) => `${t.role}: ${t.content}`).join('\n');

  const response = await chatCompletion({
    messages: [
      { role: 'system', content: MEMORY_EXTRACTION_SYSTEM_PROMPT },
      { role: 'user', content: `${existingBlock}\n\nConversation snippet:\n${conversationBlock}` },
    ],
    temperature: 0,
  });
  return parseMemoryList(response.choices[0]?.message.content ?? '');
}

/** Tolerates the model wrapping its JSON array in prose or a markdown code fence despite being
 *  told to return only JSON — pulls out the first top-level `[...]` block and parses that. Any
 *  parse failure or non-string-array shape is treated as "nothing new" rather than thrown: a
 *  malformed extraction response should never break the turn it rode in on. */
function parseMemoryList(content: string): string[] {
  const match = content.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const parsed: unknown = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  } catch {
    return [];
  }
}

const SUMMARIZE_SYSTEM_PROMPT =
  "You are the smartEnterprise assistant's conversation summarizer. Given the existing summary of " +
  'a conversation so far (if any) and a block of older messages that are about to be dropped from ' +
  "the model's limited context window, produce an updated, concise summary that preserves any " +
  'still-relevant facts, decisions, or context a later reply might need. Never invent anything not ' +
  'present in the input. Respond with ONLY the updated summary text — no preamble, no markdown.';

/**
 * Context-compaction call: folds a block of a thread's older messages (plus its prior summary, if
 * any) into an updated summary, so the caller (smart-search.service.ts) can drop the raw messages
 * from what it sends the model while keeping their gist. Same determinism reasoning as
 * `selectTool`/`narrate`/`extractMemories` — temperature 0. Falls back to the existing summary
 * (or an empty string) if the model returns no content, rather than throwing — a stale summary is
 * safer than losing it entirely.
 */
export async function summarizeConversation(
  existingSummary: string | null,
  messages: LlmChatMessage[],
): Promise<string> {
  const existingBlock = existingSummary ? `Existing summary:\n${existingSummary}` : 'No existing summary yet.';
  const olderMessagesBlock = messages.map((m) => `${m.role}: ${m.content}`).join('\n');

  const response = await chatCompletion({
    messages: [
      { role: 'system', content: SUMMARIZE_SYSTEM_PROMPT },
      { role: 'user', content: `${existingBlock}\n\nOlder messages to fold in:\n${olderMessagesBlock}` },
    ],
    temperature: 0,
  });
  return response.choices[0]?.message.content ?? existingSummary ?? '';
}
