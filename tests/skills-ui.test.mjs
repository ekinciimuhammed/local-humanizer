import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initSkills } from '../public/skills.js';

class Node {
  constructor(tag = 'div') { this.tag = tag; this.children = []; this.listeners = {}; this.attributes = {}; this.value = ''; this.classList = { toggle() {} }; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(name, handler) { this.listeners[name] = handler; }
  querySelectorAll() { return []; }
}
function find(root, tag) { if (root.tag === tag) return root; for (const child of root.children) { const found = find(child, tag); if (found) return found; } }

test('a catalog loaded before a skill mutation cannot replace the saved UI state', async () => {
  const previous = globalThis.document; const nodes = new Map();
  globalThis.document = { getElementById(id) { if (!nodes.has(id)) nodes.set(id, new Node()); return nodes.get(id); }, createElement(tag) { return new Node(tag); } };
  try {
    const initial = { items: [{ id: 'builtin:one', name: 'one', title: 'One', description: 'An editor.', markdown: 'guide', builtin: true }], enabledIds: [], limits: { enabledCount: 3 } };
    let getCount = 0; let release;
    const config = { skills: { enabledIds: [] } };
    const ui = initSkills({
      api: async () => ++getCount === 1 ? structuredClone(initial) : new Promise(resolve => { release = resolve; }),
      saveSettings: async patch => { config.skills = patch.skills; }, getConfig: () => config,
    });
    await ui.load(); const stale = ui.load();
    const checkbox = find(nodes.get('skill-list'), 'input'); checkbox.checked = true; await checkbox.listeners.change();
    assert.equal(nodes.get('skill-count').textContent, '1 / 3 enabled');
    release(structuredClone(initial)); await stale;
    assert.equal(nodes.get('skill-count').textContent, '1 / 3 enabled');
    assert.deepEqual(config.skills.enabledIds, ['builtin:one']);
  } finally { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; }
});
