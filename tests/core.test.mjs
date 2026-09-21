import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { normalizeBaseUrl, mergeModels } from '../src/models.mjs';
import { ConfigStore } from '../src/config.mjs';
import { protectText, validateFacts, splitText } from '../src/preservation.mjs';

test('normalizes roots, versioned endpoints and custom gateway paths without duplicate v1', () => {
  for (const raw of ['http://localhost:8000', 'http://localhost:8000/', 'http://localhost:8000/v1///']) {
    assert.equal(normalizeBaseUrl(raw), 'http://localhost:8000/v1');
  }
  assert.equal(normalizeBaseUrl(' https://example.test/proxy/v1/ '), 'https://example.test/proxy/v1');
  assert.equal(normalizeBaseUrl('https://example.test/api'), 'https://example.test/api');
  for (const raw of ['file:///tmp/key', 'http://user:pass@host', 'http://host/?key=foo', 'no host', 'http://host/#foo']) {
    assert.throws(() => normalizeBaseUrl(raw));
  }
});

test('discovery deduplicates, classifies and preserves preferences and missing models', () => {
  const initial = mergeModels([], [{ id: 'chat-a' }, { id: 'text-embedding-3' }, { id: 'speech-whisper' }, { id: 'Qwen-VL' }, { id: 'custom', type: 'reranker' }, { id: 'chat-a' }]);
  assert.equal(initial.length, 5);
  assert.equal(initial.find(m => m.id === 'text-embedding-3').enabled, false);
  assert.equal(initial.find(m => m.id === 'custom').enabled, false);
  assert.equal(initial.find(m => m.id === 'Qwen-VL').enabled, true);
  initial[0].enabled = false;
  initial.find(m => m.id === 'text-embedding-3').enabled = true;
  const refreshed = mergeModels(initial, [{ id: 'chat-a' }, { id: 'text-embedding-3' }, { id: 'new-chat' }]);
  assert.equal(refreshed.find(m => m.id === 'chat-a').enabled, false);
  assert.equal(refreshed.find(m => m.id === 'text-embedding-3').enabled, true);
  assert.equal(refreshed.find(m => m.id === 'speech-whisper').available, false);
  assert.equal(refreshed.find(m => m.id === 'new-chat').enabled, true);
});

test('config persists encrypted credentials, redacts public values and uses restricted permissions', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'humanizer-config-'));
  try {
    const store = new ConfigStore(dir);
    await store.init();
    await store.update({ baseUrl: 'http://localhost:8000/v1', apiKey: 'secret-for-test', models: [{ id: 'a', enabled: true, available: true }] });
    assert.equal(store.public().hasApiKey, true);
    assert.ok(!JSON.stringify(store.public()).includes('secret-for-test'));
    assert.ok(!(await readFile(join(dir, 'settings.json'), 'utf8')).includes('secret-for-test'));
    assert.equal((await stat(join(dir, 'settings.json'))).mode & 0o777, 0o600);
    const other = new ConfigStore(dir); await other.init();
    assert.equal(other.get().apiKey, 'secret-for-test');
    assert.equal(other.get().models[0].id, 'a');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('protects exact code, quotes, citations, Markdown links, URLs and emails', () => {
  const input = '# Note\n\nCall `foo(42)` or [docs](https://example.test/a?q=1). Email a@example.test. "Exact quote" [12]\n\n```js\nconst x = 42;\n```';
  const protectedText = protectText(input, ['Note']);
  assert.equal(protectedText.restore(protectedText.text), input);
  assert.ok(!protectedText.text.includes('https://example.test'));
  assert.throws(() => protectedText.restore(protectedText.text.replace(protectedText.tokens[0], 'broken')), /protected/i);
  assert.throws(() => protectedText.restore(protectedText.text + protectedText.tokens[0]), /protected/i);
});

test('restoration removes only an invented full stop after a terminally punctuated quote', () => {
  const p = protectText('She called it "promising, but unproven." Details follow.');
  assert.equal(p.restore(p.text.replace(p.tokens[0], p.tokens[0] + '.')), 'She called it "promising, but unproven." Details follow.');
  for (const source of ['She said "Ready.".', 'She called it "promising".', 'She said “Ready!” Details follow.', 'Use `x = "Ready."`.']) {
    const q = protectText(source);
    assert.equal(q.restore(q.text), source);
  }
  const question = protectText('She asked “Ready?” Next came silence.');
  assert.equal(question.restore(question.text.replace(question.tokens[0], question.tokens[0] + '.')), 'She asked “Ready?” Next came silence.');
  assert.equal(p.restore(p.text.replace(p.tokens[0], p.tokens[0] + '...')), 'She called it "promising, but unproven."... Details follow.');
});

test('fact checks catch changed and invented numbers, names and technical identifiers', () => {
  const source = 'Ayşe Yılmaz, Acme Corp için 2026 yılında 50.000 kullanıcı ve %25 artış bildirdi. user_id kullanılır.';
  assert.equal(validateFacts(source, source).length, 0);
  for (const changed of [source.replace('2026', '2025'), source.replace('50.000', '100.000'), source.replace('Ayşe Yılmaz', 'Ali Demir'), source.replace('user_id', 'user_key'), source + ' Ayrıca 75 kişi.']) {
    assert.ok(validateFacts(source, changed).length > 0, changed);
  }
  assert.equal(validateFacts('This is a sentence.', 'Here is a sentence.').length, 0);
});

test('acronym repetition may change while acronym identity and code identifiers stay protected', () => {
  assert.deepEqual(validateFacts('AI helps. AI can fail.', 'AI helps but can fail.'), []);
  assert.deepEqual(validateFacts('AI helps.', 'AI helps, though AI can fail.'), []); // semantic claims require editorial review
  assert.ok(validateFacts('AI helps.', 'ML helps.').length);
  assert.ok(validateFacts('AI helps.', 'AI and ML help.').length);
  assert.ok(validateFacts('user_id appears once.', 'user_id and user_id appear.').length);
  assert.ok(validateFacts('HTTP2 appears once.', 'HTTP2 and HTTP2 appear.').length);
});

test('known names survive a capitalized article without hiding replacement, loss or duplication', () => {
  const source = 'We plan to run the Northstar Labs pilot.';
  assert.deepEqual(validateFacts(source, 'The Northstar Labs pilot is planned.'), []);
  for (const changed of ['The Northstar Lab pilot is planned.', 'The Northstar LabsExtra pilot is planned.', 'The pilot is planned.', 'Northstar Labs and Northstar Labs plan the pilot.']) {
    assert.ok(validateFacts(source, changed).some(issue => issue.startsWith('Name / organization')));
  }
});

test('paragraph chunks join losslessly, preserve code fences and reject oversized atomic blocks', () => {
  const text = 'First paragraph.\n\nSecond paragraph.\n\n```js\nfoo();\n\nbar();\n```\n\nFinal paragraph.';
  const chunks = splitText(text, 45);
  assert.equal(chunks.map(c => c.text + c.separator).join(''), text);
  assert.ok(chunks.every(c => !c.text.includes('```') || c.text.match(/```/g).length === 2));
  assert.throws(() => splitText('x'.repeat(51), 50), /paragraph|block/i);
});


test('stream previews restore complete markers and hide partial ones', () => {
  const p = protectText('Hello `foo()` world.');
  for (let i = 0; i <= p.text.length; i++) {
    const preview = p.preview(p.text.slice(0, i));
    assert.ok(!preview.includes('__KEEP_'), preview);
  }
  assert.equal(p.preview(p.text), 'Hello `foo()` world.');
});

test('preservation detects month changes, percentage removal and currency changes', () => {
  for (const [a, b] of [
    ['January 15, 2026', 'February 15, 2026'], ['15 Ocak 2026', '15 Şubat 2026'],
    ['Artış %25 oldu.', 'Artış 25 oldu.'], ['Growth was 25%.', 'Growth was 25.'],
    ['Cost is €50.', 'Cost is $50.'], ['Fiyat 50 TL.', 'Fiyat 50 USD.'],
  ]) assert.ok(validateFacts(a, b).length, `${a} -> ${b}`);
});

test('longer closing fences, unclosed fences and multiline quotations remain immutable', () => {
  for (const source of ['```js\nlet value = true;\n````', '~~~js\nlet value = true;\n~~~~', '```js\nlet value = true;', 'He said "the first line\nand the second line".']) {
    const p = protectText(source);
    assert.ok(p.tokens.length > 0, source);
    assert.equal(p.restore(p.text), source);
    assert.ok(!p.text.includes('let value'), source);
  }
});

test('clearly image-generation metadata defaults to disabled', () => {
  const result = mergeModels([], [{ id: 'stable-diffusion-xl', task: 'text-to-image' }, { id: 'FLUX.1-dev', type: 'image-generation' }]);
  assert.ok(result.every(m => !m.enabled));
});

test('new URLs and emails cannot slip into a rewrite unnoticed', () => {
  assert.ok(validateFacts('Read the guide.', 'Read the guide at https://example.test.').length);
  assert.ok(validateFacts('Write to us.', 'Write to hello@example.test.').length);
});

test('nested Markdown link destinations and multiline quotes survive chunking', () => {
  const linked = '[documentation](https://example.test/guide_(intro))';
  const p = protectText(linked);
  assert.equal(p.text, p.tokens[0]);
  const quote = '"first paragraph\n\nsecond paragraph"';
  const source = 'Introduction.\n\n' + quote + '\n\nFinal paragraph.';
  const chunks = splitText(source, 40);
  assert.ok(chunks.some(c => c.text === quote));
  assert.equal(chunks.map(c => c.text + c.separator).join(''), source);
});
