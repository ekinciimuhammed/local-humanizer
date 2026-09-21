export function normalizeBaseUrl(value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Enter a Base URL.');
  let url;
  try { url = new URL(value.trim()); } catch { throw new Error('Base URL must be a valid http:// or https:// address.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('Use an HTTP(S) Base URL without credentials, query parameters or fragments.');
  }
  url.pathname = url.pathname.replace(/\/+$/, '') || '/v1';
  return url.href.replace(/\/$/, '');
}

function modelKind(model) {
  const metadata = [model.type, model.task, model.pipeline_tag, model.capabilities, model.metadata];
  const hint = `${model.id} ${metadata.map(v => typeof v === 'object' ? JSON.stringify(v) : v || '').join(' ')}`.toLowerCase();
  for (const [kind, pattern] of [
    ['Embedding', /embed/], ['Reranker', /rerank/], ['Speech', /whisper|(?:^|[\s_/-])(?:tts|stt|asr)(?:$|[\s_/-])|speech|transcri/],
    ['Guard', /guard|moderation/], ['OCR', /(?:^|[\s_/-])ocr(?:$|[\s_/-])/],
    ['Image generation', /text[-_ ]to[-_ ]image|image[-_ ]generation|diffusion/],
  ]) if (pattern.test(hint)) return kind;
  return /vision|(?:^|[-_/])vl(?:$|[-_/])/.test(hint) ? 'Text / vision' : 'Text';
}

export function mergeModels(previous, incoming) {
  if (!Array.isArray(incoming)) throw new Error('Invalid models response: expected a data array.');
  const old = new Map(previous.map(model => [model.id, model]));
  const seen = new Set();
  const models = [];
  for (const entry of incoming) {
    if (!entry || typeof entry.id !== 'string' || !entry.id.trim() || entry.id.length > 512 || seen.has(entry.id)) continue;
    seen.add(entry.id);
    const kind = modelKind(entry);
    models.push({ id: entry.id, kind, enabled: old.get(entry.id)?.enabled ?? kind.startsWith('Text'), available: true });
  }
  for (const model of previous) if (!seen.has(model.id)) models.push({ ...model, available: false });
  return models;
}
