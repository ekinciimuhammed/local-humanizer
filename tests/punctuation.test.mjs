import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import * as provider from '../src/provider.mjs';

async function fixture(run) {
  const calls = [];
  const state = { content: '[]', reason: 'stop', status: 200, refusal: null, wait: false };
  let received;
  const started = new Promise(resolve => { received = resolve; });
  const server = http.createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    calls.push({ path: req.url, body: JSON.parse(raw), auth: req.headers.authorization }); received();
    if (state.wait) return;
    if (state.statusText) res.statusMessage = state.statusText;
    res.writeHead(state.status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(state.status === 200 ? { choices: [{ finish_reason: state.reason, message: { role: 'assistant', content: state.content, refusal: state.refusal } }] } : { error: 'secret-api-key and private upstream body' }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const config = { baseUrl: `http://127.0.0.1:${server.address().port}/v1`, apiKey: 'secret-api-key', generation: { timeoutSeconds: 2, maxTokens: 8192, temperature: 0.8, streaming: true } };
  const proofread = (text = 'the well known plan is ready. we need follow up.', model = 'qwen3.5-9b', signal) => {
    assert.equal(typeof provider.proofreadPunctuation, 'function', 'Punctuation provider entry point is available');
    return provider.proofreadPunctuation(config, { model, text }, signal);
  };
  try { await run({ config, calls, state, proofread, started }); }
  finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}

test('punctuation applies two exact capitalization and hyphen edits in one bounded nonstreaming request', () => fixture(async ({ state, calls, proofread }) => {
  state.content = JSON.stringify([{ before: 'the well known', after: 'The well-known' }, { before: 'we need follow up.', after: 'We need follow-up.' }]);
  assert.deepEqual(await proofread(), { text: 'The well-known plan is ready. We need follow-up.', changed: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, '/v1/chat/completions');
  assert.equal(calls[0].body.stream, false);
  assert.equal(calls[0].body.temperature, 0);
  assert.ok(calls[0].body.max_tokens > 0 && calls[0].body.max_tokens <= 4096);
  assert.deepEqual(calls[0].body.chat_template_kwargs, { enable_thinking: false });
  assert.equal(calls[0].body.messages[0].role, 'system');
}));

test('other model families do not receive Qwen3.5 thinking control; no-op keeps whitespace exact', () => fixture(async ({ proofread, state, calls }) => {
  for (const model of ['qwen3-8b', 'llama-3', 'deepseek-r1', 'someone/notqwen3.5-test']) {
    state.content = '```json\n{"edits":[]}\n```';
    assert.deepEqual(await proofread('  this stays the same.\n', model), { text: '  this stays the same.\n', changed: false });
    assert.equal(calls.at(-1).body.chat_template_kwargs, undefined);
  }
}));

test('punctuation rejects lexical, numeric, name and acronym changes', () => fixture(async ({ state, proofread }) => {
  for (const [text, before, after] of [
    ['the plan is useful.', 'useful', 'helpful'],
    ['the total is 1.5.', '1.5', '1,5'],
    ['the total is 15.', '15', '16'],
    ['Northstar Labs makes tools.', 'Northstar Labs', 'northstar labs'],
    ['the API is ready.', 'API', 'api'],
  ]) {
    state.content = JSON.stringify([{ before, after }]);
    await assert.rejects(() => proofread(text), error => error instanceof provider.AppError && /punctuation|preserv|word|fact/i.test(error.message));
  }
}));

test('punctuation rejects ambiguous, overlapping, malformed and excessive patches', () => fixture(async ({ state, proofread }) => {
  for (const edits of [
    [{ before: 'the', after: 'The' }],
    [{ before: 'the plan', after: 'The plan' }, { before: 'plan is', after: 'plan, is' }],
    [{ before: 'missing', after: 'Missing' }],
    [{ before: '', after: '.' }],
    [{ before: 'the plan', after: 'The plan', reason: 'extra' }],
    [{ before: 'a'.repeat(151), after: 'a' }],
    [{ before: 'the plan', after: 'a'.repeat(171) }],
    Array.from({ length: 9 }, () => ({ before: 'the plan', after: 'The plan' })),
    { edits: [], text: 'extra' },
    { before: 'the plan', after: 'The plan' },
    [null],
  ]) {
    state.content = JSON.stringify(edits);
    await assert.rejects(() => proofread('the plan is the answer.'), provider.AppError);
  }
}));

test('punctuation rejects protected, structured, non-text and oversized input before HTTP', () => fixture(async ({ proofread, calls }) => {
  for (const text of ['', '   ', null, 123, 'a'.repeat(6001), 'a "quoted passage".', 'a `code` snippet.', 'visit https://example.test.', 'mail hi@example.test.', '# Heading\nprose.', '<b>prose</b>', 'prose\u0000bad']) {
    await assert.rejects(() => proofread(text), error => error instanceof provider.AppError && error.status === 400);
  }
  assert.equal(calls.length, 0);
}));

test('punctuation rejects lowercase custom protected terms before sending them to the model', () => fixture(async ({ proofread, config, state, calls }) => {
  config.humanizer = { protectedTerms: ['acme'] };
  state.content = JSON.stringify([{ before: 'acme', after: 'Acme' }]);
  await assert.rejects(() => proofread('acme makes useful tools.'), error => error instanceof provider.AppError && error.status === 400 && error.code === 'punctuation_input');
  assert.equal(calls.length, 0);
  config.humanizer.protectedTerms = [];
  assert.deepEqual(await proofread('acme makes useful tools.'), { text: 'Acme makes useful tools.', changed: true });
}));

test('punctuation cannot introduce a configured protected term through capitalization', () => fixture(async ({ proofread, config, state }) => {
  config.humanizer = { protectedTerms: ['acme'] };
  state.content = JSON.stringify([{ before: 'Acme', after: 'acme' }]);
  await assert.rejects(() => proofread('Acme makes useful tools.'), error => error instanceof provider.AppError && error.code === 'punctuation_edits');
}));

test('punctuation rejects empty output, invalid JSON, truncation and explicit refusal', () => fixture(async ({ proofread, state }) => {
  for (const [content, reason, refusal] of [['', 'stop', null], ['No edits needed.', 'stop', null], ['[]', 'length', null], ['[]', 'content_filter', null], ['[]', 'stop', 'I cannot comply.']]) {
    Object.assign(state, { content, reason, refusal });
    await assert.rejects(() => proofread(), provider.AppError);
  }
}));

test('punctuation does not retry and sanitizes upstream errors', () => fixture(async ({ proofread, state, calls }) => {
  state.status = 500;
  await assert.rejects(() => proofread(), error => error instanceof provider.AppError && !/secret-api-key|private upstream/.test(error.message));
  assert.equal(calls.length, 1);
}));

test('punctuation rejects inserted non-punctuation symbols, controls and empty results', () => fixture(async ({ proofread, state }) => {
  for (const [text, before, after] of [['the plan.', 'plan.', 'plan. 😀'], ['the plan.', 'plan.', 'plan.\u0000'], ['the plan.', 'plan.', 'plan.<>'], ['.', '.', '']]) {
    state.content = JSON.stringify([{ before, after }]);
    await assert.rejects(() => proofread(text), provider.AppError);
  }
}));

test('punctuation never exposes an arbitrary upstream HTTP reason phrase', () => fixture(async ({ proofread, state }) => {
  state.status = 418;
  state.statusText = 'secret-api-key and private upstream body';
  await assert.rejects(() => proofread(), error => error instanceof provider.AppError && !/secret-api-key|private upstream/.test(error.message));
}));

test('punctuation cancellation reaches the active provider request', () => fixture(async ({ proofread, state, started }) => {
  state.wait = true;
  const controller = new AbortController();
  const pending = proofread(undefined, undefined, controller.signal);
  const rejected = assert.rejects(pending, error => error instanceof provider.AppError && error.code === 'aborted' && /cancelled/i.test(error.message));
  await started;
  controller.abort();
  await rejected;
}));

test('punctuation uses the configured request timeout', () => fixture(async ({ proofread, state, config }) => {
  state.wait = true;
  config.generation.timeoutSeconds = 0.03;
  await assert.rejects(() => proofread(), error => error instanceof provider.AppError && error.code === 'aborted' && /timed out/i.test(error.message));
}));
