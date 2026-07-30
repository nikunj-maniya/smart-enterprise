import { after, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractMemories, narrate, selectTool } from './llm-client.js';

/**
 * Thin-wrapper unit tests: stub `globalThis.fetch` directly (slack-client.test.ts pattern) rather
 * than hitting a real Ollama instance — there is none in this environment. These only exercise
 * `llm-client.ts`'s own request-shaping/response-parsing; `smart-search.service.test.ts` covers the
 * orchestration built on top of it.
 */

let response: { ok: boolean; status?: number; statusText?: string; json: () => Promise<unknown> };
const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
const realFetch = globalThis.fetch;

Object.defineProperty(globalThis, 'fetch', {
  value: async (url: string, init: { body: string }) => {
    calls.push({ url, body: JSON.parse(init.body) as Record<string, unknown> });
    return response;
  },
  configurable: true,
  writable: true,
});

after(() => {
  Object.defineProperty(globalThis, 'fetch', { value: realFetch, configurable: true, writable: true });
});

beforeEach(() => {
  calls.length = 0;
  response = { ok: true, json: async () => ({ choices: [{ message: { content: '' } }] }) };
});

describe('selectTool', () => {
  it('posts the conversation and the tool registry, using tool_choice "auto"', async () => {
    await selectTool(
      [{ role: 'user', content: 'who is on leave' }],
      [{ name: 'queryAbsences', description: 'desc', parameters: { type: 'object' } }],
    );

    assert.match(calls[0].url, /\/chat\/completions$/);
    assert.equal(calls[0].body.tool_choice, 'auto');
    assert.deepEqual(calls[0].body.tools, [
      { type: 'function', function: { name: 'queryAbsences', description: 'desc', parameters: { type: 'object' } } },
    ]);
  });

  it('returns the first proposed tool call', async () => {
    response = {
      ok: true,
      json: async () => ({
        choices: [
          { message: { content: null, tool_calls: [{ id: 'c1', function: { name: 'queryUsers', arguments: '{}' } }] } },
        ],
      }),
    };

    const call = await selectTool([{ role: 'user', content: 'list users' }], []);

    assert.deepEqual(call, { id: 'c1', function: { name: 'queryUsers', arguments: '{}' } });
  });

  it('returns null when the model proposes no tool call', async () => {
    response = { ok: true, json: async () => ({ choices: [{ message: { content: 'no tool', tool_calls: [] } }] }) };

    assert.equal(await selectTool([{ role: 'user', content: 'weather?' }], []), null);
  });

  it('returns null when the response carries no tool_calls field at all', async () => {
    response = { ok: true, json: async () => ({ choices: [{ message: { content: 'no tool' } }] }) };

    assert.equal(await selectTool([{ role: 'user', content: 'weather?' }], []), null);
  });

  it('throws when the LLM endpoint responds with a non-ok status', async () => {
    response = { ok: false, status: 503, statusText: 'Service Unavailable', json: async () => ({}) };

    await assert.rejects(
      selectTool([{ role: 'user', content: 'x' }], []),
      /LLM request failed: 503 Service Unavailable/,
    );
  });
});

describe('narrate', () => {
  it('posts a plain chat completion with no tools', async () => {
    await narrate([{ role: 'user', content: 'summarize this' }]);

    assert.equal('tools' in calls[0].body, false);
    assert.equal('tool_choice' in calls[0].body, false);
  });

  it('returns the message content', async () => {
    response = { ok: true, json: async () => ({ choices: [{ message: { content: 'Here is the answer.' } }] }) };

    assert.equal(await narrate([{ role: 'user', content: 'x' }]), 'Here is the answer.');
  });

  it('returns an empty string when the response carries no content', async () => {
    response = { ok: true, json: async () => ({ choices: [{ message: { content: null } }] }) };

    assert.equal(await narrate([{ role: 'user', content: 'x' }]), '');
  });
});

describe('extractMemories', () => {
  it('posts a plain chat completion (no tools) with the existing memories and conversation folded in', async () => {
    await extractMemories([{ role: 'user', content: 'I prefer async standups' }], ['Works remote']);

    assert.equal('tools' in calls[0].body, false);
    const messages = calls[0].body.messages as Array<{ role: string; content: string }>;
    assert.match(messages[1].content, /Works remote/);
    assert.match(messages[1].content, /I prefer async standups/);
  });

  it('parses a clean JSON array response', async () => {
    response = {
      ok: true,
      json: async () => ({ choices: [{ message: { content: '["Prefers async standups"]' } }] }),
    };

    assert.deepEqual(await extractMemories([], []), ['Prefers async standups']);
  });

  it('tolerates the model wrapping the array in prose/markdown fences', async () => {
    response = {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Here you go:\n```json\n["Prefers async standups"]\n```' } }],
      }),
    };

    assert.deepEqual(await extractMemories([], []), ['Prefers async standups']);
  });

  it('returns an empty array for [] and for unparsable content, never throwing', async () => {
    response = { ok: true, json: async () => ({ choices: [{ message: { content: '[]' } }] }) };
    assert.deepEqual(await extractMemories([], []), []);

    response = { ok: true, json: async () => ({ choices: [{ message: { content: 'not json at all' } }] }) };
    assert.deepEqual(await extractMemories([], []), []);

    response = { ok: true, json: async () => ({ choices: [{ message: { content: null } }] }) };
    assert.deepEqual(await extractMemories([], []), []);
  });

  it('drops non-string entries rather than throwing', async () => {
    response = { ok: true, json: async () => ({ choices: [{ message: { content: '["ok fact", 42, null]' } }] }) };

    assert.deepEqual(await extractMemories([], []), ['ok fact']);
  });
});
