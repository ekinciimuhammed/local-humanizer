import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { createBrowserChecker } from '../browser-checker/server.mjs';

async function fixture(t, checkImpl, options = {}) {
  const app = createBrowserChecker({ checkImpl, ...options }); await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  t.after(async () => { app.closeAllConnections(); await new Promise(resolve => app.close(resolve)); });
  const base = `http://127.0.0.1:${app.address().port}`;
  const call = (body, headers = {}) => fetch(base + '/check', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Humanizer-Browser-Checker': '1', ...headers }, body: JSON.stringify(body) });
  return { app, base, call };
}
test('browser helper accepts only guarded local calls and bounded text, returning no raw text', async t => {
  let calls = 0;
  const { call, base } = await fixture(t, async text => { calls++; return { percentage: 0, textHash: createHash('sha256').update(text).digest('hex'), checkedAt: new Date().toISOString() }; });
  assert.equal((await call({ text: 'Private.' }, { Origin: 'http://127.0.0.1' })).status, 403);
  assert.equal((await call({ text: 'Private.' }, { 'X-Humanizer-Browser-Checker': '' })).status, 403);
  const hostStatus = await new Promise((resolve, reject) => http.get(base + '/health', { headers: { Host: 'evil.test', 'X-Humanizer-Browser-Checker': '1' } }, res => { res.resume(); resolve(res.statusCode); }).on('error', reject));
  assert.equal(hostStatus, 403);
  const absoluteHostStatus = await new Promise((resolve, reject) => {
    const request = http.request(base, { method: 'GET', path: base + '/health', headers: { Host: 'evil.test', 'X-Humanizer-Browser-Checker': '1' } }, res => { res.resume(); resolve(res.statusCode); });
    request.on('error', reject); request.end();
  });
  assert.equal(absoluteHostStatus, 403);
  for (const body of [{ text: '' }, { text: 'x'.repeat(15001) }, { text: 'Valid.', apiKey: 'no' }]) assert.equal((await call(body)).status, 400);
  assert.equal(calls, 0);
  const result = await (await call({ text: 'Private.' })).json(); assert.equal(result.percentage, 0); assert.equal(JSON.stringify(result).includes('Private.'), false); assert.equal(calls, 1);
});
test('browser helper rejects concurrent work and aborts the browser on caller disconnect', async t => {
  let started, aborted; const began = new Promise(resolve => { started = resolve; }); const ended = new Promise(resolve => { aborted = resolve; });
  const { base, call } = await fixture(t, async (_text, { signal }) => new Promise((resolve, reject) => { started(); signal.addEventListener('abort', () => { aborted(); reject(signal.reason); }, { once: true }); }));
  const controller = new AbortController();
  const pending = fetch(base + '/check', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Humanizer-Browser-Checker': '1' }, body: JSON.stringify({ text: 'Private.' }), signal: controller.signal });
  await began;
  assert.equal((await call({ text: 'Other.' })).status, 409);
  controller.abort(); await assert.rejects(pending); await ended;
});
test('browser helper has a deadline and redacts unexpected browser errors', async t => {
  const { call } = await fixture(t, async (_text, { signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })), { timeoutMs: 20 });
  assert.equal((await call({ text: 'Text.' })).status, 504);
  const failed = await fixture(t, async () => { throw Error('Private browser page content'); });
  const result = await failed.call({ text: 'Text.' }); assert.equal(result.status, 502); assert.equal((await result.text()).includes('Private browser page content'), false);
});
