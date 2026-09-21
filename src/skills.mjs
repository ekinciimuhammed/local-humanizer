import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

export const DEFAULT_SKILL_IDS = Object.freeze(['builtin:natural-writing', 'builtin:turkish-clarity']);
export const SKILL_LIMITS = Object.freeze({ fileBytes: 32768, customCount: 12, enabledCount: 3, instructionChars: 24000 });
const rootUrl = new URL('../', import.meta.url);

function withoutComment(value) {
  let quote = null;
  for (let index = 0; index < value.length; index++) {
    const char = value[index];
    if (quote === '"' && char === '\\') { index++; continue; }
    if (quote === "'" && char === "'" && value[index + 1] === "'") { index++; continue; }
    if (quote && char === quote) quote = null;
    else if (!quote && (char === '"' || char === "'") && index === 0) quote = char;
    else if (!quote && char === '#' && (index === 0 || /\s/.test(value[index - 1]))) return value.slice(0, index).trimEnd();
  }
  return value;
}
function scalar(value) {
  const text = value.trim();
  if (text.startsWith('"')) { try { return JSON.parse(text); } catch { throw new Error('Invalid quoted skill metadata.'); } }
  if (text.startsWith("'")) {
    if (!text.endsWith("'")) throw new Error('Invalid quoted skill metadata.');
    return text.slice(1, -1).replaceAll("''", "'");
  }
  if (/^[&*!\[\]{}`]/.test(text)) throw new Error('Use plain text for skill name and description.');
  return text;
}
export function parseSkill(markdown) {
  if (typeof markdown !== 'string' || Buffer.byteLength(markdown, 'utf8') > SKILL_LIMITS.fileBytes) throw new Error('A SKILL.md file must be text and no larger than 32 KiB.');
  const normalized = markdown.replace(/^\uFEFF/, '').replaceAll('\r\n', '\n');
  const match = normalized.match(/^---\n([\s\S]*?)\n---[ \t]*(?:\n|$)([\s\S]*)$/);
  if (!match) throw new Error('SKILL.md needs a frontmatter header between --- lines with name and description.');
  const lines = match[1].split('\n'); const metadata = {};
  for (let i = 0; i < lines.length; i++) {
    const field = lines[i].match(/^(name|description|license):[ \t]*(.*)$/);
    if (!field) continue;
    field[2] = withoutComment(field[2]);
    if (field[1] in metadata) throw new Error(`Duplicate skill field: ${field[1]}.`);
    if (/^[>|][-+]?$/.test(field[2])) {
      const parts = []; while (i + 1 < lines.length && /^(?:\s|$)/.test(lines[i + 1])) parts.push(lines[++i].trim());
      metadata[field[1]] = parts.join(field[2][0] === '>' ? ' ' : '\n').trim();
    } else metadata[field[1]] = scalar(field[2]);
  }
  if (typeof metadata.name !== 'string' || metadata.name.length > 64 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(metadata.name)) throw new Error('Skill name must be lowercase letters, numbers and hyphens (1–64 characters).');
  if (typeof metadata.description !== 'string' || !metadata.description.trim() || metadata.description.length > 1024) throw new Error('Skill description is required and must be at most 1,024 characters.');
  const instructions = match[2].replace(/\n<!-- LICENSE NOTICE[\s\S]*?-->\s*$/, '').trim();
  if (!instructions || /\u0000/.test(normalized)) throw new Error('Skill instructions must contain non-empty text without null characters.');
  return { name: metadata.name, description: metadata.description.trim(), license: typeof metadata.license === 'string' ? metadata.license.slice(0, 120) : '', instructions, markdown: normalized };
}

export async function loadBuiltinSkills() {
  const catalog = JSON.parse(await readFile(new URL('skills/catalog.json', rootUrl), 'utf8'));
  return Promise.all(catalog.skills.map(async entry => {
    const parsed = parseSkill(await readFile(new URL(entry.path, rootUrl), 'utf8'));
    return { ...parsed, id: entry.id, title: entry.title, source: entry.source, builtin: true };
  }));
}
export function skillCatalog(state, builtins) {
  return [...builtins, ...state.custom.map(skill => ({ ...parseSkill(skill.markdown), id: skill.id, title: skill.name, source: null, builtin: false }))];
}
export function resolveSkills(state, builtins) {
  if (!state || !Array.isArray(state.enabledIds) || !Array.isArray(state.custom)) throw new Error('Invalid skill settings.');
  if (state.enabledIds.length > SKILL_LIMITS.enabledCount) throw new Error('Enable at most 3 skills at once.');
  if (new Set(state.enabledIds).size !== state.enabledIds.length) throw new Error('Duplicate enabled skill IDs are not allowed.');
  const catalog = skillCatalog(state, builtins);
  const enabled = state.enabledIds.map(id => {
    const skill = catalog.find(s => s.id === id);
    if (!skill) throw new Error('Selected skill not found. Reload Settings and try again.');
    return skill;
  });
  if (enabled.reduce((sum, skill) => sum + skill.instructions.length, 0) > SKILL_LIMITS.instructionChars) throw new Error('Enabled skill instructions exceed the 24,000-character budget. Shorten a custom skill or disable one.');
  return enabled;
}
export function importSkill(state, markdown, builtins) {
  if (state.custom.length >= SKILL_LIMITS.customCount) throw new Error('You can keep up to 12 custom skills. Remove one before importing another.');
  const skill = parseSkill(markdown);
  if (state.custom.some(s => s.name === skill.name)) throw new Error('A custom skill with this name already exists. Remove it or choose a different name.');
  const id = `custom:${createHash('sha256').update(skill.markdown).digest('hex').slice(0, 20)}`;
  if (builtins.some(s => s.id === id)) throw new Error('A custom skill cannot replace a built-in skill.');
  return { ...state, custom: [...state.custom, { id, name: skill.name, markdown: skill.markdown }] };
}
export function removeSkill(state, id) {
  if (typeof id !== 'string' || !id.startsWith('custom:') || !state.custom.some(s => s.id === id)) throw new Error('Only an existing custom skill can be removed. Built-in skills can be disabled.');
  return { enabledIds: state.enabledIds.filter(value => value !== id), custom: state.custom.filter(skill => skill.id !== id) };
}
