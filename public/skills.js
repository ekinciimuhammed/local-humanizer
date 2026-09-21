const $ = id => document.getElementById(id);
function element(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
export function initSkills({ api, saveSettings, getConfig }) {
  let catalog = null; let busy = false; let approvedMarkdown = null; let loadVersion = 0;
  const status = (text = '', error = false) => { $('skills-message').textContent = text; $('skills-message').hidden = !text; $('skills-message').classList.toggle('error', error); };
  const fail = error => status(error instanceof TypeError ? 'Cannot reach the local app. Try again.' : error.message, true);
  function setBusy(value) {
    busy = value;
    for (const control of $('skills-section').querySelectorAll('button, input, textarea')) control.disabled = value;
    $('import-skill').disabled = value || approvedMarkdown !== $('skill-markdown').value;
  }
  function render() {
    const list = $('skill-list'); list.replaceChildren();
    if (!catalog) return;
    $('skill-count').textContent = `${catalog.enabledIds.length} / ${catalog.limits.enabledCount} enabled`;
    for (const skill of catalog.items) {
      const card = element('div', 'skill-row');
      const header = element('div', 'skill-row-heading');
      const info = element('div', 'skill-info');
      const title = element('h4', '', skill.title); const description = element('p', 'field-note', skill.description);
      info.append(title, description);
      const toggle = element('label', 'model-toggle');
      const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.role = 'switch'; checkbox.checked = catalog.enabledIds.includes(skill.id); checkbox.disabled = busy; checkbox.setAttribute('aria-label', `Enable skill ${skill.title}`);
      const caption = element('span', 'toggle-caption', checkbox.checked ? 'ON' : 'OFF'); caption.setAttribute('aria-hidden', 'true');
      checkbox.addEventListener('change', () => run(async () => {
        const ids = checkbox.checked ? [...catalog.enabledIds, skill.id] : catalog.enabledIds.filter(id => id !== skill.id);
        await saveSettings({ skills: { enabledIds: ids } }); catalog.enabledIds = [...getConfig().skills.enabledIds];
        status('Skill selection saved. It will apply to your next rewrite.');
      }));
      toggle.append(checkbox, caption); header.append(info, toggle);
      const origin = element('div', 'skill-origin');
      if (skill.source) {
        const link = element('a', '', skill.source.repository.replace('https://github.com/', ''));
        link.href = `${skill.source.repository}/tree/${skill.source.commit}`; link.target = '_blank'; link.rel = 'noopener noreferrer';
        origin.append(element('span', '', 'Adapted from '), link, element('span', '', ` · ${skill.source.license} · ${skill.source.commit.slice(0, 7)}`));
      } else origin.textContent = skill.builtin ? 'Local Humanizer · MIT · Turkish only' : `Your local skill${skill.license ? ` · ${skill.license}` : ''}`;
      const actions = element('div', 'skill-actions');
      const detail = document.createElement('details'); detail.className = 'skill-detail';
      detail.append(element('summary', '', 'View instructions'), element('pre', 'skill-code', skill.markdown));
      const download = element('a', 'text-button', 'Download SKILL.md'); download.href = `/api/skills/download?id=${encodeURIComponent(skill.id)}`; download.setAttribute('download', `${skill.name}.md`);
      actions.append(download);
      if (!skill.builtin) {
        const remove = element('button', 'text-button remove-skill', 'Remove'); remove.type = 'button'; remove.setAttribute('aria-label', `Remove skill ${skill.title}`);
        remove.addEventListener('click', () => run(async () => { catalog = await api('/api/skills/remove', { id: skill.id }); status('Custom skill removed.'); })); actions.append(remove);
      }
      card.append(header, origin, detail, actions); list.append(card);
    }
  }
  async function run(action) {
    if (busy) return;
    loadVersion++;
    setBusy(true); status();
    try { await action(); } catch (error) { fail(error); }
    finally { render(); setBusy(false); }
  }
  function invalidatePreview() {
    approvedMarkdown = null; $('skill-preview').hidden = true; $('import-skill').disabled = true;
  }
  $('skill-markdown').addEventListener('input', invalidatePreview);
  $('skill-file').addEventListener('change', async () => {
    const file = $('skill-file').files[0]; if (!file) return;
    invalidatePreview(); status();
    if (file.size > 32768) { status('Choose a SKILL.md file no larger than 32 KiB.', true); $('skill-file').value = ''; return; }
    try { $('skill-markdown').value = await file.text(); } catch { status('The selected file could not be read.', true); }
  });
  $('preview-skill').addEventListener('click', () => run(async () => {
    const markdown = $('skill-markdown').value; const parsed = await api('/api/skills/preview', { markdown });
    approvedMarkdown = markdown; $('skill-preview-name').textContent = parsed.name; $('skill-preview-description').textContent = parsed.description;
    $('skill-preview-body').textContent = parsed.instructions; $('skill-preview').hidden = false;
    status('Preview ready. Import stores this skill locally; it starts disabled.');
  }));
  $('skill-import-form').addEventListener('submit', event => {
    event.preventDefault(); if (approvedMarkdown !== $('skill-markdown').value) return;
    run(async () => {
      catalog = await api('/api/skills/import', { markdown: approvedMarkdown });
      $('skill-markdown').value = ''; $('skill-file').value = ''; invalidatePreview();
      status('Skill imported and stored locally. Enable it above when you want to use it.');
    });
  });
  return {
    async load() {
      const version = ++loadVersion;
      try { const data = await api('/api/skills', undefined, 'GET'); if (version !== loadVersion || busy) return; catalog = data; render(); }
      catch (error) { if (version === loadVersion) fail(error); }
    },
  };
}
