// Explicit live integration check; never included in npm test.
// Run inside the app image with this repository mounted at /evidence.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const { createApp } = await import(process.env.HUMANIZER_APP_MODULE || '../src/server.mjs');
const dir = process.env.HUMANIZER_EVIDENCE_DIR || new URL('../docs/evaluations/2026-09-21-hip/', import.meta.url).pathname;
const prior = JSON.parse(await readFile(join(dir, 'screenshot-1-pass.json'), 'utf8')).records[0];
const dataDir = await mkdtemp(join(tmpdir(), 'hip-live-smoke-'));
const app = await createApp({ dataDir });
await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${app.address().port}`;
const call = (path, method = 'GET', body) => fetch(base + path, {
  method, headers: { 'Content-Type': 'application/json', 'X-Humanizer-Request': '1' },
  ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(195000),
});
try {
  const status = await (await call('/api/hip/status')).json();
  assert.equal(status.ready, true);
  assert.equal((await call('/api/settings', 'PATCH', { engine: { kind: 'hip', hipRounds: 1 } })).status, 200);
  const start = performance.now();
  const response = await call('/api/humanize', 'POST', { text: prior.source });
  assert.equal(response.status, 200);
  const events = (await response.text()).trim().split('\n').map(JSON.parse);
  const result = events.at(-1);
  assert.equal(result.type, 'done', JSON.stringify(result));
  assert.equal(result.engine, 'hip');
  assert.equal(result.rounds, 1);
  assert.ok(result.text.length);
  const record = { checkedAt: new Date().toISOString(), status, seconds: Number(((performance.now()-start)/1000).toFixed(3)),
    purpose: 'Transport integration only: isolated app configuration, same source and seed; not a second paraphrasing pass or new quality candidate.',
    matchesDirectWorkerOutput: result.text === prior.output, events };
  await writeFile(join(dir, 'app-integration.json'), JSON.stringify(record, null, 2) + '\n');
  console.log(JSON.stringify({ ready: true, done: true, rounds: 1, seconds: record.seconds, matchesDirectWorkerOutput: record.matchesDirectWorkerOutput }));
} finally {
  app.closeAllConnections();
  await new Promise(resolve => app.close(resolve));
  await rm(dataDir, { recursive: true, force: true });
}
