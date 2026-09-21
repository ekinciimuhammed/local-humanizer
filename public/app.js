import { initSkills } from './skills.js';
import { clearWritingNotes, showWritingNotes } from './writing-notes.js';
import { mountDetectors } from './detectors.js';

const $ = id => document.getElementById(id);
let config;
let busy = false;
let controller = null;
let verified = false;
let pendingSettings = Promise.resolve();
let statsTimer = null;
let versions = null;
const strengths = {
  Light: 'A light touch. Mostly your original wording.',
  Balanced: 'Natural phrasing, faithful to the original.',
  Strong: 'A deeper rewrite. Every fact still matters.',
};
function message(id, text = '', error = false) {
  const element = $(id); element.textContent = text; element.hidden = !text; element.classList.toggle('error', error);
}
async function api(path, body, method = 'POST', signal) {
  const response = await fetch(path, { method, signal, headers: { 'Content-Type': 'application/json', 'X-Humanizer-Request': '1' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  let data;
  try { data = await response.json(); } catch { throw new Error('The local app returned an invalid response. Restart the app and try again.'); }
  if (!response.ok) throw new Error(data.message || `Request failed (${response.status}).`);
  return data;
}
function friendly(error) { return error instanceof TypeError ? 'Cannot reach the local app. Check that Humanizer is running, then try again.' : error.message; }
function stats(text) {
  const words = typeof Intl.Segmenter === 'function' ? [...new Intl.Segmenter(undefined, { granularity: 'word' }).segment(text)].filter(part => part.isWordLike).length : (text.trim().match(/\S+/gu) || []).length;
  return `${words.toLocaleString()} ${words === 1 ? 'word' : 'words'} · ${text.length.toLocaleString()} characters`;
}
function updateTextState() {
  $('original-stats').textContent = stats($('original').value);
  $('output-stats').textContent = stats($('output').value);
  $('humanize-button').disabled = busy || !$('original').value.trim() || (config?.engine.kind !== 'hip' && !$('model-select').value);
  $('clear-original').disabled = busy || !$('original').value;
  $('copy-output').disabled = busy || !verified || !$('output').value;
  $('punctuation-panel').hidden = !verified || !versions;
  $('punctuation-button').disabled = busy || !verified || !versions || !config?.baseUrl || !$('punctuation-model').value;
  $('punctuation-model').disabled = busy;
  $('simplify-selection').disabled = busy || !verified || !versions || !config?.baseUrl || !$('punctuation-model').value || $('output').selectionStart === $('output').selectionEnd;
  $('simplified-option').hidden = !versions?.simplified;
  $('punctuation-option').hidden = !versions?.punctuation;
  $('version-control').hidden = !versions || (!versions.simplified && !versions.punctuation);
  $('output-version').disabled = busy;
}
function renderMain() {
  const isHip = config.engine.kind === 'hip';
  const connected = Boolean(config.baseUrl) || isHip;
  $('onboarding').hidden = connected; $('workspace').hidden = !connected; $('open-settings').hidden = !connected;
  const select = $('model-select'); select.replaceChildren();
  const models = config.models.filter(m => m.enabled && m.available);
  if (!models.length) select.add(new Option('No enabled models', ''));
  for (const model of models) select.add(new Option(model.id, model.id));
  if (models.some(m => m.id === config.selectedModel)) select.value = config.selectedModel;
  const punctuationSelect=$('punctuation-model'), selectedSecond=punctuationSelect.value;
  punctuationSelect.replaceChildren();
  if(!models.length)punctuationSelect.add(new Option('Connect a model in Settings',''));
  for(const model of models)punctuationSelect.add(new Option(model.id,model.id));
  punctuationSelect.value=models.some(m=>m.id===selectedSecond)?selectedSecond:config.selectedModel;
  $('model-help').hidden = isHip || models.length > 0;
  $('strength-select').value = config.strength;
  $('strength-description').textContent = strengths[config.strength];
  $('tone-select').value = config.writing.tone;
  $('extra-review').checked = config.writing.review;
  $('engine-select').value = config.engine.kind; $('hip-rounds').value = config.engine.hipRounds;
  $('hip-controls').hidden = !isHip;
  for (const id of ['model-select','strength-select','tone-select','extra-review']) $(id).disabled = busy || isHip;
  $('input-limit').textContent = isHip ? 'Up to 6,000 characters · English prose' : 'Up to 200,000 characters';
  // Keep the whole pasted source; HIP's smaller limit is a validation error,
  // never a browser maxlength truncation.
  $('original').maxLength = 200000;
  if (connected) { $('connection-label').textContent = isHip ? 'Local HIP · experimental' : new URL(config.baseUrl).host; $('connection-label').title = 'Selected rewriting engine.'; }
  updateTextState();
}
async function hipStatus() {
  $('hip-status').textContent = 'Checking local worker…';
  try {const result=await api('/api/hip/status',undefined,'GET'); $('hip-status').textContent=result.ready?`Worker ready · ${result.device}`:result.message;}
  catch { $('hip-status').textContent='Local worker unavailable. See the setup guide.'; }
}
function renderModels() {
  $('model-count').textContent = config.models.filter(m => m.available).length;
  const list = $('model-list'); list.replaceChildren();
  if (!config.models.length) { const empty = document.createElement('p'); empty.className = 'field-note'; empty.textContent = 'No models were returned. Load a model on your server, then refresh.'; list.append(empty); }
  for (const model of config.models) {
    const row = document.createElement('label'); row.className = `model-row${model.available ? '' : ' unavailable'}`;
    const info = document.createElement('span'); info.className = 'model-info';
    const name = document.createElement('span'); name.className = 'model-name'; name.textContent = model.id;
    const kind = document.createElement('span'); kind.className = 'model-kind'; kind.textContent = model.available ? model.kind : `${model.kind} · No longer on this server`;
    info.append(name, kind);
    const toggle = document.createElement('span'); toggle.className = 'model-toggle';
    const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.role = 'switch'; checkbox.checked = model.enabled; checkbox.disabled = !model.available; checkbox.setAttribute('aria-label', `Enable ${model.id}`);
    const caption = document.createElement('span'); caption.className = 'toggle-caption'; caption.setAttribute('aria-hidden', 'true'); caption.textContent = model.enabled ? 'ON' : 'OFF';
    checkbox.addEventListener('change', async () => {
      checkbox.disabled = true; message('models-message');
      try { await saveSettings({ models: [{ id: model.id, enabled: checkbox.checked }] }); renderModels(); }
      catch (error) { checkbox.checked = model.enabled; checkbox.disabled = !model.available; message('models-message', friendly(error), true); }
    });
    toggle.append(checkbox, caption); row.append(info, toggle); list.append(row);
  }
}
function fillSettings() {
  $('settings-url').value = config.baseUrl; $('settings-key').value = ''; $('settings-key').placeholder = config.hasApiKey ? 'Key saved — leave blank to keep it' : 'Optional API key';
  $('remove-key-label').hidden = !config.hasApiKey; $('remove-key').checked = false;
  $('temperature').value = config.generation.temperature; $('top-p').value = config.generation.topP; $('max-tokens').value = config.generation.maxTokens;
  $('timeout').value = config.generation.timeoutSeconds; $('streaming').checked = config.generation.streaming;
  $('chunk-size').value = config.humanizer.chunkChars; $('protected-terms').value = config.humanizer.protectedTerms.join('\n');
  for (const id of ['connection-message', 'models-message', 'preferences-message']) message(id);
  renderModels();
  void skillsUI.load();
}
function saveSettings(patch) {
  const operation = pendingSettings.then(async () => { config = await api('/api/settings', patch, 'PATCH'); renderMain(); });
  pendingSettings = operation.catch(() => {}); return operation;
}
async function buttonAction(buttonId, statusId, task, working) {
  const button = $(buttonId); const original = button.textContent; button.disabled = true; if (working) button.textContent = working; message(statusId);
  try { await task(); } catch (error) { message(statusId, friendly(error), true); }
  finally { button.disabled = false; button.textContent = original; }
}
const skillsUI = initSkills({ api, saveSettings, getConfig: () => config });
const detectorUI = mountDetectors({ settingsRoot:$('checker-settings'), resultRoot:$('checker-results'), api, getTexts:()=>({source:$('original').value,result:verified?$('output').value:''}) });
$('use-hip').addEventListener('click',async()=>{try {await saveSettings({engine:{kind:'hip'}});void hipStatus();}catch(error){message('connect-status',friendly(error),true);}});
$('engine-select').addEventListener('change',async()=>{try {await saveSettings({engine:{kind:$('engine-select').value}});if(config.engine.kind==='hip')void hipStatus();}catch(error){renderMain();message('rewrite-status',friendly(error),true);}});
$('hip-rounds').addEventListener('change',async()=>{try {await saveSettings({engine:{hipRounds:Number($('hip-rounds').value)}});}catch(error){renderMain();message('rewrite-status',friendly(error),true);}});

$('connect-form').addEventListener('submit', event => {
  event.preventDefault();
  buttonAction('connect-button', 'connect-status', async () => {
    config = await api('/api/connection', { baseUrl: $('initial-url').value, apiKey: $('initial-key').value });
    $('initial-key').value = ''; renderMain(); $('original').focus();
    if (!config.models.some(m => m.enabled && m.available)) { fillSettings(); $('settings-dialog').showModal(); }
  }, 'Connecting…');
});
$('open-settings').addEventListener('click', () => { fillSettings(); $('settings-dialog').showModal(); });
$('close-settings').addEventListener('click', () => $('settings-dialog').close());
$('settings-dialog').addEventListener('click', event => { if (event.target === $('settings-dialog')) { const rect = $('settings-dialog').getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) $('settings-dialog').close(); } });
function connectionPayload() {
  const payload = { baseUrl: $('settings-url').value };
  if ($('settings-key').value || $('remove-key').checked) payload.apiKey = $('remove-key').checked ? '' : $('settings-key').value;
  return payload;
}
$('test-connection').addEventListener('click', () => {
  if (!$('connection-form').reportValidity()) return;
  buttonAction('test-connection', 'connection-message', async () => { const result = await api('/api/connection/test', connectionPayload()); message('connection-message', `Connected · ${result.count} ${result.count === 1 ? 'model' : 'models'} found. Connection not saved yet.`); }, 'Testing…');
});
$('connection-form').addEventListener('submit', event => {
  event.preventDefault();
  buttonAction('save-connection', 'connection-message', async () => { config = await api('/api/connection', connectionPayload()); fillSettings(); renderMain(); message('connection-message', `Connected · ${config.models.filter(m => m.available).length} models found. Connection saved.`); }, 'Connecting…');
});
$('refresh-models').addEventListener('click', () => buttonAction('refresh-models', 'models-message', async () => {
  await pendingSettings; config = await api('/api/models/refresh', {}); renderModels(); renderMain(); message('models-message', `${config.models.filter(m => m.available).length} models found. Your model preferences were kept.`);
}, 'Refreshing…'));
$('preferences-form').addEventListener('submit', event => {
  event.preventDefault();
  buttonAction('save-preferences', 'preferences-message', async () => {
    await saveSettings({ generation: { temperature: Number($('temperature').value), topP: Number($('top-p').value), maxTokens: Number($('max-tokens').value), timeoutSeconds: Number($('timeout').value), streaming: $('streaming').checked }, humanizer: { chunkChars: Number($('chunk-size').value), protectedTerms: $('protected-terms').value.split('\n').map(v => v.trim()).filter(Boolean) } });
    message('preferences-message', 'Preferences saved.');
  }, 'Saving…');
});
for (const [id, property] of [['model-select', 'selectedModel'], ['strength-select', 'strength']]) $(id).addEventListener('change', async () => {
  try { await saveSettings({ [property]: $(id).value }); } catch (error) { renderMain(); message('rewrite-status', friendly(error), true); }
});
for (const id of ['tone-select', 'extra-review']) $(id).addEventListener('change', async () => {
  const writing = id === 'tone-select' ? { tone: $(id).value } : { review: $(id).checked };
  try { await saveSettings({ writing }); } catch (error) { renderMain(); message('rewrite-status', friendly(error), true); }
});
$('original').addEventListener('input', () => {updateTextState();detectorUI.invalidate();});
$('punctuation-model').addEventListener('change',updateTextState);
$('output').addEventListener('select',updateTextState);
function clearVersions(){versions=null;$('version-control').hidden=true;$('output-version').value='raw';message('punctuation-status');}
$('output-version').addEventListener('change',()=>{
  if(busy||!versions)return;
  $('output').value=versions[$('output-version').value] || versions.raw;
  detectorUI.invalidate('Output version changed. Check this version separately.');
  clearWritingNotes();$('output-state').textContent={raw:'Raw rewrite',simplified:'Simplified selection',punctuation:'Punctuation suggestion'}[$('output-version').value];updateTextState();
});
async function suggestPunctuation(){
  if(busy||!verified||!versions||!$('punctuation-model').value)return;
  const snapshot=versions;
  const baseVersion=$('output-version').value==='punctuation'?(snapshot.punctuationBaseVersion || 'raw'):$('output-version').value;
  const baseText=snapshot[baseVersion];
  setBusy(true);controller=new AbortController();
  message('punctuation-status','Checking punctuation with the second model…');
  try{
    const result=await api('/api/punctuation',{text:baseText,model:$('punctuation-model').value},'POST',controller.signal);
    if(versions!==snapshot)return;
    versions.punctuation=result.changed?result.text:null;versions.punctuationBaseVersion=baseVersion;
    // Keep the base version displayed until the user selects the punctuation suggestion.
    $('output-version').value=baseVersion;$('output').value=baseText;
    detectorUI.invalidate('Punctuation suggestion available. Check each displayed version separately.');
    clearWritingNotes();$('output-state').textContent=baseVersion==='simplified'?'Simplified selection':'Raw rewrite';
    message('punctuation-status',result.changed?'Punctuation suggestion ready':'No punctuation changes suggested. Current version kept.');
  }catch(error){message('punctuation-status',controller.signal.aborted?'Punctuation check stopped. Your rewrite is kept.':friendly(error),!controller.signal.aborted);}
  finally{controller=null;setBusy(false);}
}
$('punctuation-button').addEventListener('click',suggestPunctuation);
async function simplifySelectedText(){
  if(busy || !verified || !versions || !$('punctuation-model').value)return;
  const text=$('output').value,start=$('output').selectionStart,end=$('output').selectionEnd;
  if(start===end){message('punctuation-status','Select a passage in the output first.');return;}
  const snapshot=versions;setBusy(true);controller=new AbortController();
  message('punctuation-status','Simplifying the selected passage…');
  try{
    const result=await api('/api/simplify-selection',{text,start,end,model:$('punctuation-model').value},'POST',controller.signal);
    if(versions!==snapshot)return;
    if(result.changed){
      versions.simplified=result.text;versions.punctuation=null;versions.punctuationBaseVersion=null;
      $('output-version').value='simplified';$('output').value=result.text;
      detectorUI.invalidate('Selected passage changed. Check this version separately.');clearWritingNotes();$('output-state').textContent='Simplified selection';
    }
    message('punctuation-status',result.changed?'Selected passage simplified. Review the meaning, then check this version.':'No simpler wording suggested. Current version kept.');
  }catch(error){message('punctuation-status',controller.signal.aborted?'Simplification stopped. Your output is kept.':friendly(error),!controller.signal.aborted);}
  finally{controller=null;setBusy(false);}
}
$('simplify-selection').addEventListener('click',simplifySelectedText);

$('clear-original').addEventListener('click',clearVersions);
$('clear-original').addEventListener('click', () => { $('original').value = ''; $('output').value = ''; verified = false; clearWritingNotes(); $('output-state').textContent = 'Ready when you are'; message('rewrite-status'); updateTextState(); $('original').focus(); });
$('clear-original').addEventListener('click',()=>detectorUI.invalidate('Text cleared.'));
$('copy-output').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('output').value); $('copy-label').textContent = 'Copied'; setTimeout(() => { $('copy-label').textContent = 'Copy'; }, 1600); }
  catch { $('output').focus(); $('output').select(); message('rewrite-status', 'Text selected. Press Ctrl+C or ⌘C to copy.'); }
});
function setBusy(value) {
  busy = value; document.body.classList.toggle('is-busy', value); $('original').readOnly = value;
  for (const id of ['engine-select','hip-rounds','open-settings']) $(id).disabled=value;
  for (const id of ['model-select', 'strength-select', 'tone-select', 'extra-review']) $(id).disabled = value || config.engine.kind === 'hip';
  $('stop-button').hidden = !value; $('humanize-button').hidden = value; updateTextState();
}
async function humanize() {
  if (busy || !$('original').value.trim() || (config.engine.kind !== 'hip' && !$('model-select').value)) return;
  detectorUI.invalidate('Waiting for the new rewrite.');
  clearVersions();
  setBusy(true); verified = false; clearWritingNotes(); $('output').value = ''; $('output-state').textContent = 'Writing · not yet checked';
  message('rewrite-status', 'Rewriting… The live preview is provisional until local checks finish.');
  controller = new AbortController();
  let completed = false;
  try {
    await pendingSettings;
    const response = await fetch('/api/humanize', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Humanizer-Request': '1' }, body: JSON.stringify({ text: $('original').value, model: $('model-select').value, strength: $('strength-select').value }), signal: controller.signal });
    if (!response.ok) { const error = await response.json(); throw new Error(error.message || `Request failed (${response.status}).`); }
    const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = '';
    const handle = line => {
      if (!line.trim()) return;
      const event = JSON.parse(line);
      if (event.type === 'error') throw new Error(event.message);
      if (event.type === 'progress') $('output-state').textContent = `${event.stage === 'hip' ? 'HIP pass' : event.stage === 'review' ? 'Reviewing' : 'Writing'} ${event.current}/${event.total} · not yet checked`;
      if (event.type === 'delta') $('output').value += event.text;
      if (['replace', 'done'].includes(event.type)) $('output').value = event.text;
      if (statsTimer === null) statsTimer = setTimeout(() => { statsTimer = null; updateTextState(); }, 150);
      if (event.type === 'done') { versions={raw:event.text,simplified:null,punctuation:null}; showWritingNotes(event.writingNotes, event.skills); completed = true; verified = true; $('output-state').textContent = 'Local checks passed'; message('rewrite-status', `Done${event.chunks > 1 ? ` · ${event.chunks} sections` : ''}${event.reviewed ? ' · Extra editor review completed' : ''}. Local checks passed. Review the meaning and names before using the result.`); }
    };
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true }); let boundary;
        while ((boundary = buffer.indexOf('\n')) !== -1) { handle(buffer.slice(0, boundary)); buffer = buffer.slice(boundary + 1); }
      }
      buffer += decoder.decode(); if (buffer.trim()) handle(buffer);
    } finally { await reader.cancel().catch(() => {}); }
    if (!completed) throw new Error('The connection ended before completion. The partial result was discarded.');
  } catch (error) {
    $('output').value = ''; verified = false; clearWritingNotes(); $('output-state').textContent = 'No result';
    message('rewrite-status', controller.signal.aborted ? 'Stopped. Your original text is unchanged; the partial result was discarded.' : friendly(error), !controller.signal.aborted);
  } finally { controller = null; setBusy(false); if(completed && verified)void detectorUI.check($('original').value,$('output').value,{automatic:true}); }
}
$('humanize-button').addEventListener('click', humanize);
$('stop-button').addEventListener('click', () => controller?.abort());
document.addEventListener('keydown', event => {
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && !$('settings-dialog').open) { event.preventDefault(); humanize(); }
  if (event.key === 'Escape' && busy) controller?.abort();
});
try { config = await api('/api/settings', undefined, 'GET'); $('boot-status').hidden = true; renderMain(); void detectorUI.load(); if(config.engine.kind==='hip')void hipStatus(); }
catch (error) { $('boot-status').textContent = friendly(error); }
