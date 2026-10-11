import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPoolMessages, isPoolableQuery, mentionsCollancer, poolAnswer } from '../src/ai/llmPool.js';

function response(body, ok = true) {
  return { ok, json: async () => body };
}

async function withFetch(mock, run) {
  const previous = globalThis.fetch;
  globalThis.fetch = mock;
  try { await run(); }
  finally {
    if (previous === undefined) delete globalThis.fetch;
    else globalThis.fetch = previous;
  }
}

test('provider prompt does not retrieve or inject the internal knowledge base', () => {
  const { system } = buildPoolMessages('How does Collancer work?', true);
  assert.match(system, /Always-true Collancer facts/);
  assert.doesNotMatch(system, /Relevant Collancer knowledge|Fact 1 \(/);
});

test('explicit Collancer name detection is case-insensitive and tolerates common misspellings', () => {
  assert.equal(mentionsCollancer('How does Collancer work?'), true);
  assert.equal(mentionsCollancer('Tell me about COLENSER fees'), true);
  assert.equal(mentionsCollancer('What is an API?'), false);
});

test('general niche questions stay on the AI provider path', () => {
  assert.equal(isPoolableQuery('How should beauty creators price their reels?'), true);
  assert.equal(isPoolableQuery('Find 5 beauty creators in Mumbai under ₹5000'), false);
});

test('returns a valid primary provider response without calling the secondary provider', async () => {
  await withFetch(async (url) => {
    assert.equal(String(url), 'https://text.pollinations.ai/openai');
    return response({ choices: [{ message: { content: 'Primary provider answer.' } }] });
  }, async () => {
    const result = await poolAnswer('How do creator bookings work?', true);
    assert.deepEqual(result, { text: 'Primary provider answer.', provider: 'pollinations' });
  });
});

test('continues to the secondary provider when the primary response is malformed', async () => {
  const calls = [];
  await withFetch(async (url) => {
    calls.push(String(url));
    if (String(url) === 'https://text.pollinations.ai/openai') return response({ choices: [] });
    return response({ text: 'Secondary provider answer.', provider: 'kilo' });
  }, async () => {
    const result = await poolAnswer('How do creator bookings work?', true);
    assert.deepEqual(result, { text: 'Secondary provider answer.', provider: 'kilo' });
    assert.equal(calls.length, 2);
  });
});

test('returns null only after both configured provider lanes fail', async () => {
  const calls = [];
  await withFetch(async (url) => {
    calls.push(String(url));
    return response({}, false);
  }, async () => {
    const result = await poolAnswer('How do creator bookings work?', true);
    assert.equal(result, null);
    assert.equal(calls.length, 2);
  });
});

test('general-purpose prompt allows questions outside Collancer topics', () => {
  const { system } = buildPoolMessages('Explain black holes in simple terms', false);
  assert.match(system, /general-purpose AI assistant/i);
  assert.doesNotMatch(system, /ONLY answer questions about/i);
  assert.match(system, /Do not refuse merely because a question is unrelated/i);
});
