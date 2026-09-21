import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { parseSkill, loadBuiltinSkills, resolveSkills, importSkill, removeSkill, DEFAULT_SKILL_IDS } from '../src/skills.mjs';
import { ConfigStore } from '../src/config.mjs';

const doc = (name = 'my-editor', description = 'Edit support emails clearly.', body = 'Keep the original point of view. Use plain verbs.') => `---\nname: ${name}\ndescription: ${description}\n---\n${body}`;

test('parses standard skill headers including multiline and quoted descriptions; body stays inert', () => {
  const single = parseSkill(doc());
  assert.equal(single.name, 'my-editor'); assert.equal(single.description, 'Edit support emails clearly.');
  const multi = parseSkill('\ufeff---\r\nname: email-editor\r\ndescription: >-\r\n  Edit emails\r\n  with care.\r\nallowed-tools: Bash\r\nmetadata:\r\n  name: malicious-alias\r\n---\r\n# Rules\r\nUse clear sentences.');
  assert.equal(multi.name, 'email-editor'); assert.equal(multi.description, 'Edit emails with care.');
  assert.ok(!multi.instructions.includes('allowed-tools'));
  assert.equal(parseSkill(doc('quote-editor', '"Keep the writer\'s voice."')).description, "Keep the writer's voice.");
});

test('rejects malformed, blank and oversized skills with useful errors', () => {
  for (const raw of ['', '# missing header', doc('../escape'), doc('valid', '', ''), doc('valid', 'Fine', ''), doc('valid', 'Fine', 'x'.repeat(33000))]) assert.throws(() => parseSkill(raw));
});

test('bundled profiles have immutable source attribution and their source hashes verify', async () => {
  const builtins = await loadBuiltinSkills();
  assert.equal(builtins.length, 4); assert.ok(DEFAULT_SKILL_IDS.every(id => builtins.some(s => s.id === id)));
  for (const skill of builtins) {
    assert.ok(skill.instructions.length > 200); assert.ok(skill.instructions.length < 6000);
    if (skill.source) {
      assert.equal(skill.source.license, 'MIT'); assert.match(skill.source.commit, /^[a-f0-9]{40}$/);
      for (const entry of skill.source.files) {
        const bytes = await readFile(new URL('../' + entry.path, import.meta.url));
        assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256);
      }
    }
  }
});

test('selection respects enabled IDs, distinct profiles and prompt budgets', async () => {
  const builtins = await loadBuiltinSkills();
  const custom = importSkill({ enabledIds: [], custom: [] }, doc(), builtins);
  const selected = resolveSkills({ ...custom, enabledIds: [custom.custom[0].id] }, builtins);
  assert.equal(selected[0].name, 'my-editor');
  assert.throws(() => resolveSkills({ ...custom, enabledIds: ['missing'] }, builtins), /not found|Unknown/i);
  assert.throws(() => resolveSkills({ ...custom, enabledIds: builtins.map(s => s.id) }, builtins), /three|3/i);
  assert.throws(() => resolveSkills({ ...custom, enabledIds: [builtins[0].id, builtins[0].id] }, builtins), /duplicate/i);
  const large = importSkill({ enabledIds: [], custom: [] }, doc('large', 'Long guide.', 'a'.repeat(25000)), builtins);
  assert.throws(() => resolveSkills({ ...large, enabledIds: [large.custom[0].id] }, builtins), /budget|24,000|24000/i);
  assert.deepEqual(resolveSkills({ enabledIds: [], custom: [] }, builtins), []);
});

test('custom imports never replace bundled profiles, start disabled and can be removed', async () => {
  const builtins = await loadBuiltinSkills();
  const state = { enabledIds: [...DEFAULT_SKILL_IDS], custom: [] };
  const imported = importSkill(state, doc(builtins[0].name), builtins);
  assert.equal(imported.custom.length, 1); assert.deepEqual(imported.enabledIds, state.enabledIds);
  assert.notEqual(imported.custom[0].id, builtins[0].id);
  assert.throws(() => importSkill(imported, doc(builtins[0].name), builtins), /already|duplicate/i);
  const chosen = { ...imported, enabledIds: [...state.enabledIds, imported.custom[0].id] };
  const removed = removeSkill(chosen, imported.custom[0].id);
  assert.equal(removed.custom.length, 0); assert.deepEqual(removed.enabledIds, state.enabledIds);
  assert.throws(() => removeSkill(state, builtins[0].id), /built.in|custom/i);
});

test('upgrading old configuration adds skill defaults while preserving existing connection and models', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'humanizer-skill-migration-'));
  try {
    const initial = new ConfigStore(dir); await initial.init();
    await initial.update({ baseUrl: 'http://localhost:8000/v1', apiKey: 'migration-key', models: [{ id: 'chosen', enabled: true, available: true }], selectedModel: 'chosen', generation: { ...initial.get().generation, temperature: 0.7 } });
    const file = join(dir, 'settings.json'); const saved = JSON.parse(await readFile(file, 'utf8')); delete saved.skills; await writeFile(file, JSON.stringify(saved));
    const upgraded = new ConfigStore(dir); await upgraded.init();
    assert.deepEqual(upgraded.get().skills.enabledIds, DEFAULT_SKILL_IDS);
    assert.equal(upgraded.get().apiKey, 'migration-key'); assert.equal(upgraded.get().selectedModel, 'chosen'); assert.equal(upgraded.get().generation.temperature, 0.7);
    const builtins = await loadBuiltinSkills(); const skills = importSkill(upgraded.get().skills, doc(), builtins); await upgraded.update({ skills });
    const restarted = new ConfigStore(dir); await restarted.init(); assert.equal(restarted.get().skills.custom[0].name, 'my-editor');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('portable built-in downloads carry their full license without sending legal boilerplate to the model', async () => {
  for (const skill of await loadBuiltinSkills()) {
    assert.match(skill.markdown, /Permission is hereby granted/);
    assert.match(skill.markdown, /Copyright \(c\)/);
    assert.ok(!skill.instructions.includes('Permission is hereby granted'));
    assert.equal(parseSkill(skill.markdown).name, skill.name);
  }
});

test('YAML comments outside quoted values and block scalars do not become metadata', () => {
  const parsed = parseSkill('---\nname: support-voice # local profile\ndescription: "Keep the same #1 voice." # guidance\n---\nUse plain verbs.');
  assert.equal(parsed.name, 'support-voice'); assert.equal(parsed.description, 'Keep the same #1 voice.');
  const folded = parseSkill('---\nname: folded-guide\ndescription: >- # summary\n  Keep the same\n  voice.\n---\nUse plain verbs.');
  assert.equal(folded.description, 'Keep the same voice.');
});
