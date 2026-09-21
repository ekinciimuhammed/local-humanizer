import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.mjs';
import { startMock } from './mock-provider.mjs';

async function fixture(run) {
  const dir = await mkdtemp(join(tmpdir(), 'humanizer-review-'));
  const mock = await startMock(); const app = await createApp({ dataDir: dir });
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.address().port}`;
  const call = (path, body, method = 'POST') => fetch(base + path, { method, headers: { 'Content-Type': 'application/json', 'X-Humanizer-Request': '1' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const generate = async () => (await (await call('/api/humanize', { text: 'It is important to note that 2026 is uncertain. "Not proven."', model: 'local-editor', strength: 'Balanced' })).text()).trim().split('\n').map(JSON.parse);
  try { await call('/api/connection', { baseUrl: mock.url }); await run({ mock, call, generate }); }
  finally { app.closeAllConnections(); await new Promise(resolve => app.close(resolve)); await mock.close(); await rm(dir, { recursive: true, force: true }); }
}

test('review is opt-in, validates preferences, and sends source plus draft on exactly one extra pass', () => fixture(async ({ mock, call, generate }) => {
  const initial = await (await call('/api/settings', null, 'GET')).json();
  assert.deepEqual(initial.writing, { tone: 'Original', review: false });
  for (const writing of [{ tone: 'Hype' }, { review: 'yes' }]) assert.equal((await call('/api/settings', { writing }, 'PATCH')).status, 400);
  await call('/api/settings', { writing: { tone: 'Natural', review: true } }, 'PATCH');
  const start = mock.state.calls.length;
  const events = await generate();
  assert.equal(mock.state.calls.length - start, 2);
  const draftCall = JSON.parse(mock.state.calls.at(-2).data.messages.at(-1).content);
  const reviewCall = JSON.parse(mock.state.calls.at(-1).data.messages.at(-1).content);
  assert.equal(reviewCall.text, draftCall.text);
  assert.ok(reviewCall.draft && !reviewCall.draft.includes('It is important to note that'));
  assert.match(mock.state.calls.at(-1).data.messages[0].content, /source is authoritative/i);
  assert.ok(events.some(e => e.type === 'progress' && e.stage === 'review'));
  const done = events.find(e => e.type === 'done');
  assert.ok(done); assert.equal(done.reviewed, true); assert.equal(done.tone, 'Natural');
  assert.equal(done.text, '2026 is uncertain. "Not proven."');
  await call('/api/settings', { writing: { review: false } }, 'PATCH');
  assert.equal((await (await call('/api/settings', null, 'GET')).json()).writing.tone, 'Natural');
  const count = mock.state.calls.length; await generate(); assert.equal(mock.state.calls.length - count, 1);
}));

test('review changing a fact or truncating cannot publish a completed result', () => fixture(async ({ mock, call, generate }) => {
  await call('/api/settings', { writing: { review: true } }, 'PATCH');
  for (const mode of ['review-facts', 'review-length']) {
    mock.state.mode = mode;
    const events = await generate();
    assert.ok(events.some(e => e.type === 'error'), mode);
    assert.equal(events.some(e => e.type === 'done'), false, mode);
  }
}));
