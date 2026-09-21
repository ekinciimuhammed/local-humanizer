import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseVisibleResult, runPublicCheck } from '../browser-checker/checker.mjs';
import { DetectorStore, DetectorService } from '../src/detectors.mjs';
import { mountDetectors } from '../public/detectors.js';

const digest = text => createHash('sha256').update(text).digest('hex');
const visible = 'Detect Text\nYour Text is Human written\n\n0%\nAI GPT*\nThe submitted paragraph.';
test('public page parser accepts actual displayed zero and rejects unrelated, missing or invalid scores', () => {
  assert.equal(parseVisibleResult(visible), 0);
  assert.equal(parseVisibleResult('Your Text contains mixed signals\n94.4%\nAI GPT*'), 94.4);
  for (const text of ['Marketing 99% accurate', 'Your Text is Human written', 'Your Text has AI\n101%\nAI GPT*', 'Your Text has AI\n-2%\nAI GPT*', 'Your Text has AI\nNaN%\nAI GPT*']) assert.throws(() => parseVisibleResult(text), /score/i);
  assert.throws(() => parseVisibleResult('Please verify you are human\n' + visible), /challenge/i);
});

function fakeBrowser({ body = visible, gate, preExistingResult = false, rewriteInput = value => value } = {}) {
  const events = []; let closed = 0, filled;
  const page = {
    goto: async url => { events.push(['goto', url]); },
    locator: selector => ({ fill: async text => { filled = rewriteInput(text); events.push(['fill', selector, text]); }, inputValue: async () => filled, innerText: async () => body }),
    getByRole: (role, options) => ({ click: async () => events.push(['click', role, options.name]) }),
    getByText: () => {
      const matched = { count: async () => preExistingResult ? 1 : 0, first: () => ({ waitFor: async () => { if (gate) await gate; } }) };
      return { ...matched, filter: () => matched };
    },
    setDefaultTimeout() {},
  };
  const browserType = { launch: async () => ({ newContext: async () => ({ newPage: async () => page }), close: async () => { closed++; } }) };
  return { browserType, events, closed: () => closed };
}
test('browser runner sends exact text through a fresh public page and returns no raw text', async () => {
  const fake = fakeBrowser(), text = 'A private paragraph.';
  const result = await runPublicCheck(text, { browserType: fake.browserType });
  assert.deepEqual(fake.events, [['goto', 'https://www.zerogpt.com/'], ['fill', '#textArea', text], ['click', 'button', 'Detect Text']]);
  assert.deepEqual(Object.keys(result).sort(), ['checkedAt', 'percentage', 'textHash']);
  assert.equal(result.percentage, 0); assert.equal(result.textHash, digest(text)); assert.ok(Date.parse(result.checkedAt));
  assert.equal(JSON.stringify(result).includes(text), false); assert.ok(fake.closed() > 0);
});
test('browser runner rejects challenges, invalid input and cancellation without another click', async () => {
  const challenged = fakeBrowser({ body: 'Please verify you are human' });
  await assert.rejects(runPublicCheck('Text.', { browserType: challenged.browserType }), /challenge/i);
  assert.equal(challenged.events.filter(event => event[0] === 'click').length, 0);
  const invalid = fakeBrowser();
  await assert.rejects(runPublicCheck('x'.repeat(15001), { browserType: invalid.browserType }), /15,000/);
  assert.equal(invalid.events.length, 0);
  let release; const fake = fakeBrowser({ gate: new Promise(resolve => { release = resolve; }) });
  const controller = new AbortController();
  const pending = runPublicCheck('Text.', { browserType: fake.browserType, signal: controller.signal });
  await new Promise(resolve => setTimeout(resolve, 5)); controller.abort();
  await assert.rejects(pending, /cancel/i); release(); assert.ok(fake.closed() > 0);
  assert.equal(fake.events.filter(event => event[0] === 'click').length, 1);
});
test('browser runner has a deadline even when the page never produces a result', async () => {
  let release; const fake = fakeBrowser({ gate: new Promise(resolve => { release = resolve; }) });
  await assert.rejects(runPublicCheck('Text.', { browserType: fake.browserType, timeoutMs: 15 }), /timed out/i);
  release(); assert.ok(fake.closed() > 0);
});
test('browser runner will not submit silently truncated or altered textarea contents', async () => {
  const fake = fakeBrowser({ rewriteInput: text => text.slice(0, 3) });
  await assert.rejects(runPublicCheck('Full private input.', { browserType: fake.browserType }), /changed|truncated/i);
  assert.equal(fake.events.filter(event => event[0] === 'click').length, 0);
});
test('browser runner cannot attribute a pre-existing visible result to a new input', async () => {
  const fake = fakeBrowser({ preExistingResult: true });
  await assert.rejects(runPublicCheck('A newly submitted document.', { browserType: fake.browserType }), /pre-existing|existing result/i);
  assert.equal(fake.events.filter(event => event[0] === 'click').length, 0);
});

async function storeFixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'humanizer-web-checker-')); t.after(() => rm(directory, { recursive: true, force: true }));
  const store = new DetectorStore(directory); await store.init(); return store;
}
function input(store, result = 'Private output.') { const { provider, revision } = store.public(); return { provider, settingsRevision: revision, automatic: false, result }; }
const response = text => ({ percentage: 0, textHash: digest(text), checkedAt: new Date().toISOString() });
test('web provider requires no API credentials and never forwards stored credentials to the helper', async t => {
  const store = await storeFixture(t); await store.update({ enabled: true, provider: 'zerogpt-web', gptzeroApiKey: 'must-not-send', zerogptApiKey: 'also-private' });
  const calls = [];
  const service = new DetectorService(store, { fetchImpl: async (url, options) => { calls.push({ url, options }); return Response.json(response(JSON.parse(options.body).text)); } });
  const result = await service.check(input(store));
  assert.equal(calls.length, 1); assert.match(calls[0].url, /^http:\/\/(127\.0\.0\.1|host\.docker\.internal):18083\/check$/);
  assert.deepEqual(JSON.parse(calls[0].options.body), { text: 'Private output.' });
  assert.equal(calls[0].options.headers['X-Humanizer-Browser-Checker'], '1');
  assert.equal(JSON.stringify(calls).includes('must-not-send'), false); assert.equal(JSON.stringify(calls).includes('also-private'), false);
  assert.deepEqual(result.result.metrics, { visiblePercentage: 0 });
  await service.check(input(store)); assert.equal(calls.length, 1);
});
test('web checker accepts the internal Compose service address without allowing arbitrary remote URLs', async t => {
  const previous = process.env.HUMANIZER_BROWSER_CHECKER_URL;
  t.after(() => { if (previous === undefined) delete process.env.HUMANIZER_BROWSER_CHECKER_URL; else process.env.HUMANIZER_BROWSER_CHECKER_URL = previous; });
  const store = await storeFixture(t); await store.update({ enabled: true, provider: 'zerogpt-web' }); let calls = 0;
  const service = new DetectorService(store, { fetchImpl: async (url, options) => {
    assert.equal(url, 'http://browser-checker:18083/check'); calls++; return Response.json(response(JSON.parse(options.body).text));
  } });
  process.env.HUMANIZER_BROWSER_CHECKER_URL = 'http://browser-checker:18083';
  assert.equal((await service.check(input(store))).result.metrics.visiblePercentage, 0);
  for (const url of ['http://browser-checker.evil.test:18083', 'https://browser-checker:18083', 'http://remote.test:18083']) {
    process.env.HUMANIZER_BROWSER_CHECKER_URL = url;
    await assert.rejects(service.check(input(store, 'Different text.')), /local HTTP origin/);
  }
  assert.equal(calls, 1);
});
test('web checker schema, text limit, stale consent and auto-off reject without false scores', async t => {
  const store = await storeFixture(t); await store.update({ enabled: true, provider: 'zerogpt-web' });
  let calls = 0;
  const service = new DetectorService(store, { fetchImpl: async () => { calls++; return Response.json(response('Private output.')); } });
  await assert.rejects(service.check(input(store, 'x'.repeat(15001))), /15,000/);
  await assert.rejects(service.check({ ...input(store), automatic: true }), /automatic/i);
  const stale = input(store); await store.update({ compareSource: true });
  await assert.rejects(service.check(stale), error => error.status === 409); assert.equal(calls, 0);
  await store.update({ compareSource: false });
  for (const body of [{}, { ...response('Private output.'), percentage: '0' }, { ...response('Private output.'), percentage: 101 }, { ...response('Other text.') }, { ...response('Private output.'), checkedAt: 'bad' }, { ...response('Private output.'), rawText: 'private' }]) {
    const malformed = new DetectorService(store, { fetchImpl: async () => Response.json(body) });
    await assert.rejects(malformed.check(input(store)), /response|score|version/i);
  }
  const blocked = new DetectorService(store, { fetchImpl: async () => Response.json({ code: 'challenge' }, { status: 422 }) });
  await assert.rejects(blocked.check(input(store)), /visible|website|challenge/i);
});

test('web checker cancellation aborts helper transport and missing helpers never become a zero score', async t => {
  const store = await storeFixture(t); await store.update({ enabled: true, provider: 'zerogpt-web' });
  let helperSignal;
  const service = new DetectorService(store, { fetchImpl: async (_url, { signal }) => { helperSignal = signal; return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })); } });
  const controller = new AbortController(); const pending = service.check(input(store), { signal: controller.signal }); controller.abort();
  await assert.rejects(pending, /cancel/i); assert.equal(helperSignal.aborted, true);
  const missing = new DetectorService(store, { fetchImpl: async () => { throw new TypeError('Connection refused'); } });
  await assert.rejects(missing.check(input(store)), /optional website checker.*browser-checker/i);
});

class Node {
  constructor(tag) { this.tag = tag; this.children = []; this.listeners = {}; this.value = ''; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  setAttribute() {}
  addEventListener(name, handler) { this.listeners[name] = handler; }
}
const textContent = node => [node.textContent || '', ...node.children.map(textContent)].join(' ');
test('web provider UI can check without credentials and clearly labels the public-page percentage', async () => {
  const previous = globalThis.document; globalThis.document = { createElement: tag => new Node(tag) };
  try {
    const settingsRoot = new Node('section'), resultRoot = new Node('section'); const texts = { source: 'Source.', result: 'Result.' }; let body;
    const ui = mountDetectors({ settingsRoot, resultRoot, getTexts: () => texts, api: async (_path, value) => { body = value; return { provider: 'zerogpt-web', result: { metrics: { visiblePercentage: 0 }, textHash: digest(texts.result), checkedAt: new Date().toISOString() } }; } });
    ui.updateSettings({ enabled: true, autoCheck: false, provider: 'zerogpt-web', revision: 'web-revision' });
    await ui.check(texts.source, texts.result);
    assert.equal(body.provider, 'zerogpt-web'); assert.equal(body.automatic, false);
    assert.match(textContent(resultRoot), /visible.*0\.0%/i); assert.match(textContent(settingsRoot), /experimental/i);
  } finally { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; }
});
