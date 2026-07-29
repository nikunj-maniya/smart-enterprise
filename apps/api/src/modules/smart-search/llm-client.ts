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
