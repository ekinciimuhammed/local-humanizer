const labels = { gptzero: 'GPTZero API', zerogpt: 'ZeroGPT.com API', 'zerogpt-web': 'ZeroGPT public website (experimental)', 'sapling-web': 'Sapling public website (experimental)' };
function node(tag, text, className = '') { const element = document.createElement(tag); if (text !== undefined) element.textContent = text; if (className) element.className = className; return element; }
const ready = settings => settings.provider.endsWith('-web') || (settings.provider === 'gptzero' ? settings.hasGptzeroApiKey : settings.hasZerogptBearerToken || settings.hasZerogptApiKey);

export function mountDetectors({ settingsRoot, resultRoot, api, getTexts, onSettingsChange = () => {} }) {
  let settings = { enabled: false, autoCheck: false, compareSource: false, provider: 'gptzero', additionalProviders: [] };
  let revision = 0, controller = null, saving = false, loading = 0;
  const form = node('form'), status = node('p', '', 'field-note'), results = node('div');
  status.setAttribute('role', 'status');
  const title = node('h3', 'External checker');
  const notice = node('p', 'Optional. Checking sends the output text to the selected external services. Enable source comparison to send the original too. Your service account may charge for each scan.', 'field-note');
  const inputs = {};
  function field(key, label, type = 'checkbox') {
    const wrapper = node('label', undefined, type === 'checkbox' ? 'checkbox-row' : 'field');
    const input = node('input'); input.type = type; input.name = key; input.setAttribute('aria-label', label);
    if (type === 'password') { input.autocomplete = 'new-password'; input.placeholder = 'Leave blank to keep saved credential'; }
    if(type==='password')wrapper.append(node('span',label),input);else wrapper.append(input,node('span',label)); inputs[key] = input; return wrapper;
  }
  const enabled = field('enabled', 'Enable external checking');
  const providerLabel = node('label', 'Service', 'field'), provider = node('select'); provider.setAttribute('aria-label', 'Checker service');
  for (const [value, label] of Object.entries(labels)) { const option = node('option', label); option.value = value; provider.append(option); }
  providerLabel.append(provider);
  const additional = node('fieldset', undefined, 'checker-services'); additional.append(node('legend', 'Also compare with'));
  const extraInputs = {};
  for (const [value, label] of Object.entries(labels)) {
    const row = node('label', undefined, 'checkbox-row'), box = node('input'); box.type = 'checkbox'; box.setAttribute('aria-label', `Also check with ${label}`); extraInputs[value] = box;
    row.append(box, node('span', label)); additional.append(row);
  }
  const auto = field('autoCheck', 'Check automatically after a successful rewrite');
  const compare = field('compareSource', 'Also send and check the original text');
  const credentials = node('div');
  const gptKey = field('gptzeroApiKey', 'GPTZero API key', 'password');
  const zeroBearer = field('zerogptBearerToken', 'ZeroGPT bearer token (JWT)', 'password');
  const zeroKey = field('zerogptApiKey', 'ZeroGPT API key (if your account requires it)', 'password');
  const credentialState = node('p', '', 'field-note');
  const zeroNotice = node('p', 'ZeroGPT Business documents JWT authentication; account-specific API key requirements vary. Live authentication has not been verified for this integration.', 'field-note');
  const webNotice = node('p', 'Experimental public website checking needs the optional browser helper, but no API key. It sends text to each selected visible website once, up to 15,000 characters. A challenge, quota, or changed page stops the check. Start it with: docker compose --profile browser-checker up -d --build browser-checker', 'field-note');
  const remove = field('removeCredentials', 'Remove saved credentials for the selected service');
  credentials.append(gptKey, zeroBearer, zeroKey, credentialState, zeroNotice, webNotice, remove);
  const save = node('button', 'Save checker settings', 'button secondary'); save.type = 'submit';
  const saveStatus = node('p', '', 'field-note'); saveStatus.setAttribute('role', 'status');
  form.append(enabled, providerLabel, additional, auto, compare, credentials, save, saveStatus); settingsRoot.append(title, notice, form);
  const checkButton = node('button', 'Check output', 'button secondary'); checkButton.type = 'button';
  const cancelButton = node('button', 'Cancel check', 'text-button'); cancelButton.type = 'button'; cancelButton.hidden = true;
  resultRoot.append(node('h3', 'External checker'), node('p', 'External scores are separate from local writing notes and do not prove authorship or preserved meaning.', 'field-note'), checkButton, cancelButton, status, results);
  function controls() {
    checkButton.disabled = !settings.enabled || Boolean(controller) || saving;
    const count = new Set([settings.provider, ...(settings.additionalProviders || [])]).size;
    checkButton.textContent = count > 1 ? `Check with ${count} services` : `Check with ${labels[settings.provider]}`;
    for (const [value, box] of Object.entries(extraInputs)) { box.disabled = value === provider.value; if (box.disabled) box.checked = false; }
    cancelButton.hidden = !controller;
    gptKey.hidden = provider.value !== 'gptzero'; zeroBearer.hidden = zeroKey.hidden = zeroNotice.hidden = provider.value !== 'zerogpt';
    webNotice.hidden = !provider.value.endsWith('-web'); credentialState.hidden = remove.hidden = provider.value.endsWith('-web');
    credentialState.textContent = ready({ ...settings, provider: provider.value }) ? 'Credentials saved locally and encrypted.' : 'No credentials saved for this service.';
    save.disabled = saving;
  }
  function invalidate(message = 'Text changed. Previous checker results are stale; check again.') {
    revision++; controller?.abort(); controller = null; results.replaceChildren(); status.textContent = message; controls();
  }
  function updateSettings(value) {
    settings = { ...value }; invalidate(settings.enabled ? settings.provider.endsWith('-web') ? 'Ready when the optional browser helper is running.' : 'Ready to check when credentials are saved.' : 'External checking is off.');
    for (const key of ['enabled', 'autoCheck', 'compareSource']) inputs[key].checked = Boolean(settings[key]);
    provider.value = settings.provider; for (const [value, box] of Object.entries(extraInputs)) box.checked = (settings.additionalProviders || []).includes(value); controls();
  }
  function render(data) {
    const group = node('section', undefined, 'checker-provider'); group.append(node('h4', labels[data.provider]));
    const percent = scan => !scan ? null : data.provider === 'gptzero' ? scan.metrics.ai * 100 : data.provider.endsWith('-web') ? scan.metrics.visiblePercentage : scan.metrics.fakePercentage;
    const before = percent(data.source), after = percent(data.result);
    const summary = node('div', undefined, 'checker-comparison');
    summary.append(node('span', before === null ? 'Not checked' : `${before.toFixed(1)}%`, 'checker-before'), node('span', '→', 'checker-arrow'), node('strong', after === null ? 'Not checked' : `${after.toFixed(1)}%`, 'checker-after'));
    group.append(node('p', `Before → After · ${data.provider === 'gptzero' ? 'AI-only class probability' : data.provider.endsWith('-web') ? 'Visible website percentage' : 'fakePercentage'}`, 'field-note'), summary);
    if (before !== null && after !== null) {
      const difference = after - before;
      group.append(node('p', difference === 0 ? 'No change' : `${Math.abs(difference).toFixed(1)} percentage points ${difference < 0 ? 'lower' : 'higher'}`, `checker-delta ${difference < 0 ? 'lower' : difference > 0 ? 'higher' : ''}`));
    } else group.append(node('p', 'Enable original comparison in Settings to see the change.', 'field-note'));
    const details = node('details'); details.append(node('summary', 'Scan details')); group.append(details); results.append(group);
    for (const kind of ['source', 'result']) {
      const scan = data[kind]; if (!scan) continue;
      const card = node('div', undefined, 'checker-card'); card.append(node('h4', `${kind === 'source' ? 'Original' : 'Output'} · ${labels[data.provider]}`));
      if (data.provider === 'gptzero') for (const [key, label] of [['ai', 'AI-only class probability'], ['mixed', 'Mixed class probability'], ['human', 'Human-only class probability']]) card.append(node('p', `${label}: ${(scan.metrics[key] * 100).toFixed(1)}%`));
      else if (data.provider.endsWith('-web')) card.append(node('p', `${data.provider === 'sapling-web' ? 'Sapling' : 'ZeroGPT'} visible website percentage: ${scan.metrics.visiblePercentage.toFixed(1)}%`));
      else card.append(node('p', `ZeroGPT fakePercentage: ${scan.metrics.fakePercentage.toFixed(1)}%`));
      if (scan.classification) card.append(node('p', `Classification: ${scan.classification}`));
      card.append(node('p', `${new Date(scan.checkedAt).toLocaleString()} · Text ${scan.textHash.slice(0, 12)} · Detector version ${scan.detectorVersion || 'not reported'}`, 'field-note'));
      details.append(card);
    }
  }
  async function check(source, result, { automatic = false } = {}) {
    if (!settings.enabled || (automatic && !settings.autoCheck)) return;
    if (!result?.trim()) { status.textContent = 'Complete a rewrite before checking its output.'; return; }
    invalidate('Checking with the external services…'); const version = revision, abort = new AbortController(); controller = abort; controls();
    const chosen = [...new Set([settings.provider, ...(settings.additionalProviders || [])])]; let completed = 0;
    try {
      for (const service of chosen) {
        if (version !== revision || abort.signal.aborted) return;
        status.textContent = `Checking ${labels[service]} (${chosen.indexOf(service) + 1}/${chosen.length})…`;
        try {
          if (!ready({ ...settings, provider: service })) throw new Error('Save credentials for this checker in Settings first. No score is available.');
          const data = await api('/api/detectors/check', { result, ...(settings.compareSource ? { source } : {}), provider: service, settingsRevision: settings.revision, automatic }, 'POST', abort.signal);
          if (version !== revision || abort.signal.aborted) return;
          const current = getTexts(); if (current.source !== source || current.result !== result) { invalidate(); return; }
          render(data); completed++;
        } catch (error) {
          if (version !== revision || abort.signal.aborted) return;
          const current = getTexts(); if (current.source !== source || current.result !== result) { invalidate(); return; }
          const row = node('section', undefined, 'checker-provider checker-error'); row.append(node('h4', labels[service]), node('p', 'Before — → After —'), node('p', error instanceof TypeError ? 'Cannot reach the local checker service. No score is available.' : error.message, 'field-note')); results.append(row);
        }
      }
      status.textContent = `${completed}/${chosen.length} checks completed. Scores refer to the text versions shown below.`;
    } finally { if (controller === abort) { controller = null; controls(); } }
  }
  provider.addEventListener('change', controls);
  checkButton.addEventListener('click', () => { const { source, result } = getTexts(); return check(source, result); });
  cancelButton.addEventListener('click', () => invalidate('Checker request cancelled. No score is available.'));
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (saving) return; saving = true; loading++; invalidate('Checker settings are changing.'); controls(); saveStatus.textContent = '';
    const patch = { provider: provider.value, additionalProviders: Object.entries(extraInputs).filter(([value, box]) => value !== provider.value && box.checked).map(([value]) => value) };
    for (const key of ['enabled', 'autoCheck', 'compareSource']) patch[key] = inputs[key].checked;
    const keys = patch.provider.endsWith('-web') ? [] : patch.provider === 'gptzero' ? ['gptzeroApiKey'] : ['zerogptBearerToken', 'zerogptApiKey'];
    for (const key of keys) if (inputs.removeCredentials.checked) patch[key] = ''; else if (inputs[key].value) patch[key] = inputs[key].value;
    try {
      updateSettings(await api('/api/detectors/settings', patch, 'PATCH')); onSettingsChange(settings);
      for (const key of ['gptzeroApiKey', 'zerogptBearerToken', 'zerogptApiKey']) inputs[key].value = '';
      inputs.removeCredentials.checked = false; saveStatus.textContent = 'Checker settings saved.';
    } catch (error) { saveStatus.textContent = error instanceof TypeError ? 'Cannot reach the local app.' : error.message; }
    finally { saving = false; controls(); }
  });
  updateSettings(settings);
  return {
    check, invalidate, updateSettings,
    async load() {
      const version = ++loading;
      try { const value = await api('/api/detectors/settings', undefined, 'GET'); if (version === loading && !saving) updateSettings(value); }
      catch (error) { if (version === loading) saveStatus.textContent = error instanceof TypeError ? 'Cannot load checker settings.' : error.message; }
    },
  };
}
