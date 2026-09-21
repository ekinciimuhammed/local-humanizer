import { test, before, after } from 'node:test';
import http from 'node:http';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startMock } from './mock-provider.mjs';
import { createApp } from '../src/server.mjs';
import { rewrite } from '../src/provider.mjs';
import { defaults } from '../src/config.mjs';

let mock, app, base, dir;
before(async () => {
  mock = await startMock(); dir = await mkdtemp(join(tmpdir(), 'humanizer-http-'));
  app = await createApp({ dataDir: dir });
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve)); base = `http://127.0.0.1:${app.address().port}`;
});
after(async () => { await mock?.close(); if (app) await new Promise(resolve => { app.close(resolve); app.closeAllConnections(); }); await rm(dir, { recursive: true, force: true }); });
async function call(path, body, method = 'POST', headers = {}) {
  return fetch(base + path, { method, headers: { 'Content-Type': 'application/json', 'X-Humanizer-Request': '1', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
}
async function generate(text = 'It is important to note that 2026 is the year.', extra = {}) {
  const response = await call('/api/humanize', { text, model: 'local-editor', strength: 'Balanced', ...extra });
  return { response, events: (await response.text()).trim().split('\n').filter(Boolean).map(JSON.parse) };
}

test('connect discovers models and never returns the API key; toggles survive refresh', async () => {
  const response = await call('/api/connection', { baseUrl: mock.url, apiKey: 'secret-for-test' });
  assert.equal(response.status, 200); const config = await response.json();
  assert.equal(config.models.length, 2); assert.equal(config.hasApiKey, true); assert.equal(config.apiKey, undefined);
  assert.equal(mock.state.calls[0].path, '/v1/models');
  assert.equal(mock.state.calls[0].auth, 'Bearer secret-for-test');
  await call('/api/settings', { models: [{ id: 'local-editor', enabled: false }] }, 'PATCH');
  mock.state.models.push({ id: 'new-model' });
  const updated = await (await call('/api/models/refresh', {})).json();
  assert.equal(updated.models.find(m => m.id === 'local-editor').enabled, false);
  assert.equal(updated.models.find(m => m.id === 'new-model').enabled, true);
  assert.equal((await generate()).response.status, 400);
  await call('/api/settings', { models: [{ id: 'local-editor', enabled: true }] }, 'PATCH');
});

test('SSE rewrite completes with same-language text and restored protected content', async () => {
  const source = '2026 yılında önemle belirtmek gerekir ki [belgeler](https://example.test) hazır. `foo(42)`';
  const { response, events } = await generate(source);
  assert.equal(response.status, 200);
  assert.ok(events.some(e => e.type === 'delta'));
  const done = events.find(e => e.type === 'done');
  assert.equal(done.text, source.replace('önemle belirtmek gerekir ki ', ''));
  assert.ok(!done.text.includes('__KEEP_'));
});

test('non-streaming fallback only retries explicit unsupported streaming', async () => {
  mock.state.mode = 'fallback'; const count = mock.state.calls.length;
  assert.ok((await generate()).events.some(e => e.type === 'done'));
  assert.equal(mock.state.calls.length - count, 2);
  assert.equal(mock.state.calls.at(-1).data.stream, false);
  mock.state.mode = 'json'; assert.ok((await generate()).events.some(e => e.type === 'done'));
  mock.state.mode = 'stream';
});

test('fact changes, empty responses, truncation and interrupted streams are rejected', async () => {
  for (const [mode, pattern] of [['facts', /Number|date|preserv/i], ['empty', /empty/i], ['length', /token|truncat/i], ['interrupted', /interrupt|incomplete/i]]) {
    mock.state.mode = mode;
    const { events } = await generate();
    assert.equal(events.some(e => e.type === 'done'), false, mode);
    assert.match(events.find(e => e.type === 'error').message, pattern, mode);
  }
  mock.state.mode = 'stream';
});

test('actionable authentication, context and rate-limit errors redact provider secrets', async () => {
  for (const [mode, pattern] of [['unauthorized', /401|Unauthorized/], ['context', /context/i], ['rate', /429|rate/i]]) {
    mock.state.mode = mode;
    const { events } = await generate(); const error = events.find(e => e.type === 'error');
    assert.match(error.message, pattern); assert.ok(!error.message.includes('secret-for-test'));
  }
  mock.state.mode = 'stream';
});

test('same-origin and host checks reject unwanted requests; settings are validated', async () => {
  assert.equal((await call('/api/connection/test', { baseUrl: mock.url }, 'POST', { Origin: 'https://evil.test' })).status, 403);
  assert.equal((await call('/api/settings', { generation: { temperature: -1 } }, 'PATCH')).status, 400);
  assert.equal((await call('/api/settings', { generation: { streaming: 'yes' } }, 'PATCH')).status, 400);
  const hostStatus = await new Promise((resolve, reject) => {
    http.get(base + '/api/settings', { headers: { Host: 'evil.test' } }, res => { res.resume(); resolve(res.statusCode); }).on('error', reject);
  });
  assert.equal(hostStatus, 403);
});

test('request cancellation aborts upstream work', async () => {
  mock.state.mode = 'slow'; const count = mock.state.calls.length; const controller = new AbortController();
  const pending = fetch(base + '/api/humanize', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Humanizer-Request': '1' }, body: JSON.stringify({ text: 'A paragraph.', model: 'local-editor', strength: 'Light' }), signal: controller.signal });
  const response = await pending; const reader = response.body.getReader(); await reader.read();
  for (let n = 0; n < 40 && mock.state.calls.length === count; n++) await new Promise(resolve => setTimeout(resolve, 10));
  controller.abort();
  for (let n = 0; n < 40 && mock.state.aborted === 0; n++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.ok(mock.state.aborted > 0); mock.state.mode = 'stream';
});

test('split UTF-8 request bytes preserve the exact original text', async () => {
  mock.state.mode = 'stream';
  const text = 'Ayşe Yılmaz 2026 yılında geldi.';
  const payload = Buffer.from(JSON.stringify({ text, model: 'local-editor', strength: 'Light' }));
  const boundary = payload.indexOf(Buffer.from('ş')) + 1;
  const events = await new Promise((resolve, reject) => {
    const req = http.request(base + '/api/humanize', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Humanizer-Request': '1' } }, res => {
      let output = ''; res.setEncoding('utf8'); res.on('data', c => output += c); res.on('end', () => resolve(output.trim().split('\n').map(JSON.parse)));
    }).on('error', reject);
    req.write(payload.subarray(0, boundary)); setTimeout(() => req.end(payload.subarray(boundary)), 30);
  });
  assert.equal(events.find(e => e.type === 'done')?.text, text);
});

test('model refresh reconciles with current preferences and rejects a changed connection', async () => {
  mock.state.mode = 'stream';
  let release;
  mock.state.modelsGate = new Promise(resolve => { release = resolve; });
  let calls = mock.state.calls.length;
  const pending = call('/api/models/refresh', {});
  while (mock.state.calls.length === calls) await new Promise(resolve => setTimeout(resolve, 5));
  await call('/api/settings', { models: [{ id: 'local-editor', enabled: false }] }, 'PATCH');
  release(); mock.state.modelsGate = null;
  const updated = await (await pending).json();
  assert.equal(updated.models.find(m => m.id === 'local-editor').enabled, false);
  const second = await startMock(); second.state.models = [{ id: 'different-model' }];
  try {
    mock.state.modelsGate = new Promise(resolve => { release = resolve; });
    calls = mock.state.calls.length;
    const stale = call('/api/models/refresh', {});
    while (mock.state.calls.length === calls) await new Promise(resolve => setTimeout(resolve, 5));
    await call('/api/connection', { baseUrl: second.url });
    release(); mock.state.modelsGate = null;
    assert.equal((await stale).status, 409);
    const current = await (await fetch(base + '/api/settings')).json();
    assert.equal(current.models[0].id, 'different-model');
    assert.equal(current.hasApiKey, false);
  } finally {
    release(); mock.state.modelsGate = null;
    await second.close(); await call('/api/connection', { baseUrl: mock.url });
  }
});

test('stream transport stays proportional to output size', async () => {
  mock.state.mode = 'stream';
  const text = 'a simple sentence. '.repeat(100);
  const { events } = await generate(text);
  assert.ok(events.some(e => e.type === 'done'));
  const transferred = events.reduce((sum, event) => sum + (event.text?.length || 0), 0);
  assert.ok(transferred <= text.length * 4, `Sent ${transferred} text characters for ${text.length} output characters`);
});

test('missing models, unavailable server and 5xx produce meaningful errors', async () => {
  mock.state.mode = 'models-missing';
  let response = await call('/api/connection/test', { baseUrl: mock.url });
  assert.match((await response.json()).message, /Models endpoint not found/);
  mock.state.mode = 'server-error';
  assert.match((await generate()).events.find(e => e.type === 'error').message, /503 LLM server error/);
  mock.state.mode = 'stream';
  const closed = await startMock(); await closed.close();
  response = await call('/api/connection/test', { baseUrl: closed.url });
  assert.match((await response.json()).message, /Connection refused/);
});

test('upstream redirects are rejected instead of forwarding a key or text', async () => {
  mock.state.mode = 'redirect'; const before = mock.state.calls.length;
  const response = await call('/api/connection/test', { baseUrl: mock.url, apiKey: 'key-stays-here' });
  assert.equal(response.status, 502); assert.match((await response.json()).message, /redirect/);
  assert.equal(mock.state.calls.length - before, 1); mock.state.mode = 'stream';
});

test('timeout applies to an open stream and cancels the upstream request', async () => {
  mock.state.mode = 'slow';
  const config = { ...structuredClone(defaults), baseUrl: mock.url + '/v1', generation: { ...defaults.generation, timeoutSeconds: 0.03 } };
  await assert.rejects(rewrite(config, { model: 'local-editor', strength: 'Light', text: 'hello', context: {} }, () => {}), /timed out/);
  mock.state.mode = 'stream';
});

test('long documents preserve paragraphs, order and adjacent context across requests', async () => {
  await call('/api/settings', { humanizer: { chunkChars: 1000 } }, 'PATCH');
  const original = ['a short phrase. '.repeat(38), 'another phrase. '.repeat(38), 'the last phrase. '.repeat(38)].join('\n\n');
  const before = mock.state.calls.length;
  const { events } = await generate(original);
  const done = events.find(e => e.type === 'done');
  assert.equal(done?.text, original); assert.equal(done?.chunks, 3);
  const calls = mock.state.calls.slice(before);
  assert.equal(calls.length, 3);
  assert.ok(JSON.parse(calls[1].data.messages.at(-1).content).context.preceding.length > 0);
  assert.ok(JSON.parse(calls[1].data.messages.at(-1).content).context.following.length > 0);
  await call('/api/settings', { humanizer: { chunkChars: 6000 } }, 'PATCH');
});

test('skill catalog, preview, import, enable, prompt use and deletion work end to end', async () => {
  const catalogResponse = await fetch(base + '/api/skills'); assert.equal(catalogResponse.status, 200);
  const catalog = await catalogResponse.json(); assert.equal(catalog.items.length, 4);
  const markdown = '---\nname: support-voice\ndescription: Rewrite support messages.\n---\nPrefer concrete verbs. Keep every original fact.';
  const preview = await call('/api/skills/preview', { markdown }); assert.equal(preview.status, 200); assert.equal((await preview.json()).name, 'support-voice');
  const imported = await call('/api/skills/import', { markdown }); assert.equal(imported.status, 200);
  const data = await imported.json(); const custom = data.items.find(s => s.name === 'support-voice');
  assert.ok(custom.id.startsWith('custom:')); assert.ok(!data.enabledIds.includes(custom.id));
  const download = await fetch(base + '/api/skills/download?id=' + encodeURIComponent(custom.id)); assert.equal(await download.text(), markdown);
  const selected = await call('/api/settings', { skills: { enabledIds: [custom.id] } }, 'PATCH'); assert.equal(selected.status, 200);
  const prior = mock.state.calls.length;
  const { events } = await generate(); assert.ok(events.some(e => e.type === 'done'));
  const request = mock.state.calls[prior].data;
  const content = JSON.parse(request.messages.at(-1).content);
  assert.equal(content.editing_guides.length, 1); assert.equal(content.editing_guides[0].name, 'support-voice');
  assert.match(content.editing_guides[0].instructions, /concrete verbs/);
  assert.ok(events.find(e => e.type === 'done').writingNotes);
  assert.equal((await call('/api/settings', { skills: { enabledIds: ['missing'] } }, 'PATCH')).status, 400);
  assert.equal((await call('/api/skills/import', { markdown })).status, 400);
  assert.equal((await call('/api/skills/remove', { id: catalog.items[0].id })).status, 400);
  assert.equal((await call('/api/skills/remove', { id: custom.id })).status, 200);
  const after = await (await fetch(base + '/api/skills')).json(); assert.ok(!after.enabledIds.includes(custom.id)); assert.equal(after.items.length, 4);
  assert.equal((await call('/api/skills/import', { markdown: 'not a skill' })).status, 400);
  await call('/api/settings', { skills: { enabledIds: catalog.enabledIds } }, 'PATCH');
});
