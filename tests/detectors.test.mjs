import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DetectorStore, DetectorService } from '../src/detectors.mjs';
import { mountDetectors } from '../public/detectors.js';

async function fixture(t, patch = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'humanizer-detectors-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = new DetectorStore(directory); await store.init();
  await store.update(patch); return { store, directory };
}
const gpt = { documents: [{ class_probabilities: { ai: 0.7, mixed: 0.2, human: 0.1 }, document_classification: 'AI_ONLY' }] };
const ready = { enabled: true, gptzeroApiKey: 'detector-test-secret' };
function check(service, input, options) {
  const { provider, revision } = service.store.public();
  return service.check({ provider, settingsRevision: revision, automatic: false, ...input }, options);
}

test('stale tab consent cannot send text to changed provider or source-comparison settings', async t => {
  const { store } = await fixture(t, { ...ready, zerogptApiKey: 'zero-key' }); let calls = 0;
  const service = new DetectorService(store, { fetchImpl: async () => { calls++; return Response.json(gpt); } });
  const snapshot = store.public();
  assert.match(snapshot.revision, /^[a-f0-9]{24}$/);
  const request = { provider: snapshot.provider, settingsRevision: snapshot.revision, automatic: false, result: 'Private output.' };
  await store.update({ provider: 'zerogpt' });
  await assert.rejects(service.check(request), error => error.status === 409);
  await store.update({ provider: 'gptzero', compareSource: true });
  await assert.rejects(service.check({ ...request, source: 'Private source.' }), error => error.status === 409);
  const current = store.public();
  await assert.rejects(service.check({ ...request, provider: 'zerogpt', settingsRevision: current.revision }), error => error.status === 409);
  assert.equal(calls, 0);
});

test('server requires explicit request consent and rejects automatic checks when auto-check is off', async t => {
  const { store, directory } = await fixture(t, ready); let calls = 0;
  const service = new DetectorService(store, { fetchImpl: async () => { calls++; return Response.json(gpt); } });
  const current = store.public(), request = { provider: current.provider, settingsRevision: current.revision, automatic: false, result: 'Output.' };
  await assert.rejects(service.check({ ...request, automatic: true }), /automatic|auto/i);
  for (const field of ['provider', 'settingsRevision', 'automatic']) {
    const missing = { ...request }; delete missing[field];
    await assert.rejects(service.check(missing), error => error.status === 400);
  }
  await assert.rejects(service.check({ ...request, automatic: 'false' }), error => error.status === 400);
  const restarted = new DetectorStore(directory); await restarted.init();
  assert.notEqual(restarted.public().revision, current.revision);
  await assert.rejects(new DetectorService(restarted, { fetchImpl: async () => { calls++; return Response.json(gpt); } }).check(request), error => error.status === 409);
  assert.equal(calls, 0);
});


test('detector secrets are encrypted, redacted, independent and survive restart', async t => {
  const { store, directory } = await fixture(t, { ...ready, zerogptBearerToken: 'bearer-test-secret', zerogptApiKey: 'zero-test-secret' });
  const publicSettings = store.public();
  assert.equal(publicSettings.hasGptzeroApiKey, true);
  assert.equal(publicSettings.hasZerogptBearerToken, true);
  assert.equal(publicSettings.gptzeroApiKey, undefined);
  assert.equal(publicSettings.zerogptBearerToken, undefined);
  assert.equal(publicSettings.zerogptApiKey, undefined);
  for (const name of await readdir(directory)) {
    assert.equal((await stat(join(directory, name))).mode & 0o777, 0o600);
    const bytes = await readFile(join(directory, name));
    for (const secret of ['detector-test-secret', 'bearer-test-secret', 'zero-test-secret']) assert.equal(bytes.includes(secret), false);
  }
  const restored = new DetectorStore(directory); await restored.init();
  assert.equal(restored.get().gptzeroApiKey, 'detector-test-secret');
  await restored.update({ gptzeroApiKey: '' });
  assert.equal(restored.public().hasGptzeroApiKey, false);
  assert.equal(restored.get().zerogptApiKey, 'zero-test-secret');
});

test('unknown settings and invalid credential headers never persist', async t => {
  const { store } = await fixture(t);
  for (const patch of [{ provider: 'custom' }, { endpoint: 'https://evil.test' }, { enabled: 'yes' }, { autoCheck: 1 }, { gptzeroApiKey: 'a\nb' }, { nested: { secret: 'leak' } }]) {
    await assert.rejects(store.update(patch), error => error.status === 400);
  }
  assert.equal(store.public().enabled, false);
});

test('concurrent checker settings updates preserve credentials and corrupted ciphertext fails closed', async t => {
  const { store, directory } = await fixture(t, ready);
  await Promise.all([store.update({ compareSource: true }), store.update({ autoCheck: true })]);
  assert.equal(store.get().compareSource, true); assert.equal(store.get().autoCheck, true); assert.equal(store.get().gptzeroApiKey, ready.gptzeroApiKey);
  const path = join(directory, 'detector-settings.json'), saved = JSON.parse(await readFile(path, 'utf8'));
  const bytes = Buffer.from(saved.encryptedCredentials, 'base64'); bytes[30] ^= 1;
  await writeFile(path, JSON.stringify({ ...saved, encryptedCredentials: bytes.toString('base64') }));
  await assert.rejects(new DetectorStore(directory).init(), /decrypt/i);
});

test('disabled, missing credentials and invalid text send no external requests', async t => {
  const { store } = await fixture(t); let calls = 0;
  const service = new DetectorService(store, { fetchImpl: async () => { calls++; throw Error('unexpected'); } });
  await assert.rejects(check(service, { result: 'A result.' }), /disabled/i);
  await store.update({ enabled: true });
  await assert.rejects(check(service, { result: 'A result.' }), /key/i);
  await store.update(ready);
  for (const input of [{ result: '' }, { result: 'x'.repeat(50_001) }, { result: 4 }, { result: 'valid', endpoint: 'https://evil.test' }]) await assert.rejects(check(service, input), error => error.status === 400);
  assert.equal(calls, 0);
});

test('GPTZero uses the fixed endpoint and preserves independent probabilities and text hashes', async t => {
  const { store, directory } = await fixture(t, { ...ready, compareSource: true }); const calls = [];
  const service = new DetectorService(store, { fetchImpl: async (url, options) => { calls.push({ url, options }); return Response.json(gpt); } });
  const result = await check(service, { source: 'The source.', result: 'The rewrite.' });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, 'https://api.gptzero.me/v2/predict/text');
  assert.equal(calls[0].options.headers['x-api-key'], 'detector-test-secret');
  assert.equal(calls[0].options.redirect, 'error');
  assert.deepEqual(JSON.parse(calls[0].options.body), { document: 'The source.' });
  assert.deepEqual(result.result.metrics, { ai: 0.7, mixed: 0.2, human: 0.1 });
  assert.equal(result.result.classification, 'AI_ONLY');
  assert.match(result.result.textHash, /^[a-f0-9]{64}$/);
  assert.notEqual(result.source.textHash, result.result.textHash);
  await check(service, { source: 'The source.', result: 'The rewrite.' });
  assert.equal(calls.length, 2, 'completed identical text is cached in this process');
  for (const name of await readdir(directory)) assert.equal((await readFile(join(directory, name))).includes('The rewrite.'), false);
});

test('ZeroGPT uses its own headers and percentage without combining provider metrics', async t => {
  const { store } = await fixture(t, { enabled: true, provider: 'zerogpt', zerogptBearerToken: 'jwt-value', zerogptApiKey: 'api-value' });
  const service = new DetectorService(store, { fetchImpl: async (url, options) => {
    assert.equal(url, 'https://api.zerogpt.com/api/detect/detectText');
    assert.equal(options.headers.Authorization, 'Bearer jwt-value'); assert.equal(options.headers.ApiKey, 'api-value');
    assert.deepEqual(JSON.parse(options.body), { input_text: 'A result.' });
    return Response.json({ success: true, data: { fakePercentage: 73.5, aiWords: 7, textWords: 10, h: [] } });
  } });
  const result = await check(service, { result: 'A result.' });
  assert.deepEqual(result.result.metrics, { fakePercentage: 73.5 });
  assert.equal(result.source, undefined);
});

test('HTTP failures and schema failures are redacted errors, never fabricated zero or retries', async t => {
  const { store } = await fixture(t, ready);
  for (const status of [401, 403, 429, 500]) {
    let calls = 0;
    const service = new DetectorService(store, { fetchImpl: async () => { calls++; return new Response('secret ' + ready.gptzeroApiKey, { status }); } });
    await assert.rejects(check(service, { result: 'A result.' }), error => error.message.includes(String(status)) && !error.message.includes(ready.gptzeroApiKey));
    assert.equal(calls, 1);
  }
  for (const value of [null, {}, { documents: [{ class_probabilities: { ai: -1, mixed: 0, human: 1 } }] }, { documents: [{ class_probabilities: { ai: '0.5', mixed: 0.5, human: 0 } }] }]) {
    const service = new DetectorService(store, { fetchImpl: async () => Response.json(value) });
    await assert.rejects(check(service, { result: 'A result.' }), /response|probabilit/i);
  }
  await store.update({ provider: 'zerogpt', zerogptApiKey: 'key' });
  for (const value of [null, '0', -1, 101]) {
    const service = new DetectorService(store, { fetchImpl: async () => Response.json({ data: { fakePercentage: value } }) });
    await assert.rejects(check(service, { result: 'A result.' }), /response|percentage/i);
  }
});

test('cancellation, timeouts, large bodies and changed settings cannot publish success', async t => {
  const { store } = await fixture(t, ready);
  const hanging = async (_url, { signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
  const service = new DetectorService(store, { fetchImpl: hanging, timeoutMs: 20 });
  await assert.rejects(check(service, { result: 'A result.' }), /timed out/i);
  const controller = new AbortController(); const pending = check(service, { result: 'A result.' }, { signal: controller.signal }); controller.abort();
  await assert.rejects(pending, /cancel/i);
  const large = new DetectorService(store, { fetchImpl: async () => new Response('x'.repeat(1025)), maxResponseBytes: 1024 });
  await assert.rejects(check(large, { result: 'A result.' }), /size|large/i);
  let release; const delayed = new DetectorService(store, { fetchImpl: async () => new Promise(resolve => { release = resolve; }) });
  const stale = check(delayed, { result: 'A result.' }); await store.update({ enabled: false }); release(Response.json(gpt));
  await assert.rejects(stale, /changed|cancel/i);
});

test('abort before checking and concurrent checks never add upstream calls', async t => {
  const { store } = await fixture(t, ready); let calls = 0, release;
  const service = new DetectorService(store, { fetchImpl: async () => { calls++; return new Promise(resolve => { release = resolve; }); } });
  const controller = new AbortController(); controller.abort();
  await assert.rejects(check(service, { result: 'A result.' }, { signal: controller.signal }), /cancel/i);
  assert.equal(calls, 0);
  const pending = check(service, { result: 'A result.' });
  await assert.rejects(check(service, { result: 'Another result.' }), error => error.status === 409);
  assert.equal(calls, 1); release(Response.json(gpt)); await pending;
});

test('timeout covers slow response bodies as well as connection establishment', async t => {
  const { store } = await fixture(t, ready);
  const service = new DetectorService(store, { timeoutMs: 15, fetchImpl: async (_url, { signal }) => new Response(new ReadableStream({
    start(controller) { signal.addEventListener('abort', () => controller.error(signal.reason), { once: true }); },
  })) });
  await assert.rejects(check(service, { result: 'A result.' }), /timed out/i);
});

class Node {
  constructor(tag) { this.tag = tag; this.children = []; this.listeners = {}; this.attributes = {}; this.value = ''; this.classList = { toggle() {} }; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(name, handler) { this.listeners[name] = handler; }
}
const allText = node => [node.textContent || '', ...node.children.map(allText)].join(' ');
test('checker UI discards delayed responses after edits and automatic scans require opt-in', async () => {
  const previous = globalThis.document; globalThis.document = { createElement: tag => new Node(tag) };
  try {
    const settingsRoot = new Node('section'), resultRoot = new Node('section'); let release, calls = 0, signal;
    let texts = { source: 'Source.', result: 'Result.' };
    const ui = mountDetectors({ settingsRoot, resultRoot, getTexts: () => texts, api: async (_path, _body, _method, abortSignal) => { calls++; signal = abortSignal; return new Promise(resolve => { release = resolve; }); } });
    ui.updateSettings({ enabled: false, autoCheck: false, provider: 'gptzero' });
    await ui.check(texts.source, texts.result, { automatic: true }); assert.equal(calls, 0);
    ui.updateSettings({ enabled: true, autoCheck: false, provider: 'gptzero', hasGptzeroApiKey: true });
    await ui.check(texts.source, texts.result, { automatic: true }); assert.equal(calls, 0);
    const pending = ui.check(texts.source, texts.result);
    texts = { source: 'Changed.', result: 'Result.' }; ui.invalidate(); assert.equal(signal.aborted, true);
    release({ provider: 'gptzero', result: { metrics: { ai: 0.7, mixed: 0.2, human: 0.1 }, textHash: 'abc', checkedAt: new Date().toISOString() } }); await pending;
    assert.doesNotMatch(allText(resultRoot), /70(?:\.0)?%/);
    assert.match(allText(resultRoot), /changed|stale/i);
  } finally { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; }
});

test('checker UI displays the measured provider metrics and clears them on a failed scan', async () => {
  const previous = globalThis.document; globalThis.document = { createElement: tag => new Node(tag) };
  try {
    const settingsRoot = new Node('section'), resultRoot = new Node('section'); let failure = false;
    const texts = { source: 'Source.', result: 'Result.' };
    const ui = mountDetectors({ settingsRoot, resultRoot, getTexts: () => texts, api: async () => {
      if (failure) throw new Error('429 Checker quota reached.');
      return { provider: 'gptzero', result: { metrics: { ai: 0.7, mixed: 0.2, human: 0.1 }, textHash: 'abc', detectorVersion: '<script>remote</script>', checkedAt: '2026-09-21T10:00:00Z' } };
    } });
    ui.updateSettings({ enabled: true, autoCheck: true, provider: 'gptzero', hasGptzeroApiKey: true });
    await ui.check(texts.source, texts.result, { automatic: true });
    assert.match(allText(resultRoot), /AI-only class probability: 70.0%/); assert.match(allText(resultRoot), /Mixed class probability: 20.0%/); assert.match(allText(resultRoot), /Human-only class probability: 10.0%/);
    failure = true; await ui.check(texts.source, texts.result);
    assert.match(allText(resultRoot), /429/); assert.doesNotMatch(allText(resultRoot), /70.0%/);
  } finally { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; }
});

test('checker UI detects a changed snapshot even before an edit hook runs', async () => {
  const previous = globalThis.document; globalThis.document = { createElement: tag => new Node(tag) };
  try {
    const settingsRoot = new Node('section'), resultRoot = new Node('section'); let release;
    let texts = { source: 'Source.', result: 'Result.' };
    const ui = mountDetectors({ settingsRoot, resultRoot, getTexts: () => texts, api: async () => new Promise(resolve => { release = resolve; }) });
    ui.updateSettings({ enabled: true, autoCheck: true, provider: 'gptzero', hasGptzeroApiKey: true });
    const pending = ui.check(texts.source, texts.result);
    texts = { source: 'Source.', result: 'Different result.' };
    release({ provider: 'gptzero', result: { metrics: { ai: 0.7, mixed: 0.2, human: 0.1 }, textHash: 'abc', checkedAt: '2026-09-21T10:00:00Z' } }); await pending;
    assert.match(allText(resultRoot), /changed|stale/i); assert.doesNotMatch(allText(resultRoot), /Checking with the external|70.0%/);
  } finally { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; }
});

test('checker UI sends the displayed provider and revision with explicit automatic consent', async () => {
  const previous = globalThis.document; globalThis.document = { createElement: tag => new Node(tag) };
  try {
    const settingsRoot = new Node('section'), resultRoot = new Node('section'), sent = [];
    const texts = { source: 'Source.', result: 'Result.' };
    const ui = mountDetectors({ settingsRoot, resultRoot, getTexts: () => texts, api: async (_path, body) => { sent.push(body); throw new Error('Fixture complete.'); } });
    ui.updateSettings({ enabled: true, autoCheck: true, compareSource: false, provider: 'gptzero', revision: 'snapshot-version', hasGptzeroApiKey: true });
    await ui.check(texts.source, texts.result);
    await ui.check(texts.source, texts.result, { automatic: true });
    assert.deepEqual(sent, [
      { result: 'Result.', provider: 'gptzero', settingsRevision: 'snapshot-version', automatic: false },
      { result: 'Result.', provider: 'gptzero', settingsRevision: 'snapshot-version', automatic: true },
    ]);
  } finally { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; }
});
