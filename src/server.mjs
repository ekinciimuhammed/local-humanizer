import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, resolve } from 'node:path';
import { ConfigStore } from './config.mjs';
import { normalizeBaseUrl, mergeModels } from './models.mjs';
import { AppError, discoverModels, rewrite, proofreadPunctuation } from './provider.mjs';
import { protectText, validateFacts, splitText } from './preservation.mjs';
import { loadBuiltinSkills, skillCatalog, resolveSkills, parseSkill, importSkill, removeSkill, SKILL_LIMITS } from './skills.mjs';
import { compareWriting } from './style-analysis.mjs';
import { HipClient, hipInput, runHip, defaultHipUrl } from './hip.mjs';
import { DetectorStore, DetectorService } from './detectors.mjs';

const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
const files = new Map([['/', ['index.html', 'text/html']], ['/styles.css', ['styles.css', 'text/css']], ['/app.js', ['app.js', 'text/javascript']], ['/skills.js', ['skills.js', 'text/javascript']], ['/writing-notes.js', ['writing-notes.js', 'text/javascript']], ['/humanizer-skills.zip', ['humanizer-skills.zip', 'application/zip']]]);
files.set('/detectors.js', ['detectors.js', 'text/javascript']);
const bad = message => new AppError(message, 400, 'invalid_input');
function send(res, status, value) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); }
async function readJson(req) {
  if (!req.headers['content-type']?.startsWith('application/json') || req.headers['x-humanizer-request'] !== '1') throw new AppError('Use the Humanizer interface to make this request.', 403);
  const buffers = []; let size = 0;
  for await (const part of req) { size += part.length; if (size > 1_500_000) throw new AppError('Request too large (limit: 1.5 MB).', 413); buffers.push(part); }
  const body = Buffer.concat(buffers).toString('utf8');
  let value; try { value = JSON.parse(body || '{}'); } catch { throw bad('Invalid JSON request.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw bad('Expected a JSON object.');
  return value;
}
function numeric(value, min, max, label, integer = false) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) throw bad(`${label} must be ${integer ? 'an integer' : 'a number'} between ${min} and ${max}.`);
  return value;
}
function settingsPatch(body, config, builtins) {
  const patch = {};
  if ('engine' in body) {
    const value = body.engine;
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !['kind','hipRounds'].includes(k))) throw bad('Invalid engine preferences.');
    if ('kind' in value && !['connected','hip'].includes(value.kind)) throw bad('Select a supported engine.');
    if ('hipRounds' in value && ![1,2,4].includes(value.hipRounds)) throw bad('HIP supports one, two or four fixed passes.');
    patch.engine = { ...config.engine, ...value };
  }
  if ('writing' in body) {
    if (!body.writing || typeof body.writing !== 'object' || Array.isArray(body.writing) || Object.keys(body.writing).some(key => !['tone', 'review'].includes(key))) throw bad('Invalid writing preferences.');
    patch.writing = { ...config.writing };
    if ('tone' in body.writing) {
      if (!['Original', 'Natural', 'Conversational', 'Formal', 'Plainspoken'].includes(body.writing.tone)) throw bad('Select a supported writing tone.');
      patch.writing.tone = body.writing.tone;
    }
    if ('review' in body.writing) {
      if (typeof body.writing.review !== 'boolean') throw bad('Extra review must be enabled or disabled.');
      patch.writing.review = body.writing.review;
    }
  }
  if ('models' in body) {
    if (!Array.isArray(body.models) || body.models.some(m => !m || typeof m.id !== 'string' || typeof m.enabled !== 'boolean' || !config.models.some(existing => existing.id === m.id))) throw bad('Invalid model selection. Refresh Models and try again.');
    patch.models = config.models.map(m => ({ ...m, enabled: body.models.find(v => v.id === m.id)?.enabled ?? m.enabled }));
  }
  if ('generation' in body) {
    if (!body.generation || typeof body.generation !== 'object') throw bad('Invalid generation settings.');
    patch.generation = { ...config.generation };
    for (const [name, min, max, integer] of [['temperature', 0, 2], ['topP', 0.01, 1], ['maxTokens', 128, 131072, true], ['timeoutSeconds', 5, 1800, true]]) {
      if (name in body.generation) patch.generation[name] = numeric(body.generation[name], min, max, name, integer);
    }
    if ('streaming' in body.generation) {
      if (typeof body.generation.streaming !== 'boolean') throw bad('Streaming must be enabled or disabled.');
      patch.generation.streaming = body.generation.streaming;
    }
  }
  if ('humanizer' in body) {
    if (!body.humanizer || typeof body.humanizer !== 'object') throw bad('Invalid humanizer settings.');
    patch.humanizer = { ...config.humanizer };
    if ('chunkChars' in body.humanizer) patch.humanizer.chunkChars = numeric(body.humanizer.chunkChars, 1000, 30000, 'Chunk size', true);
    if ('protectedTerms' in body.humanizer) {
      const terms = body.humanizer.protectedTerms;
      if (!Array.isArray(terms) || terms.length > 200 || terms.some(t => typeof t !== 'string' || t.length > 200 || t.includes('\n'))) throw bad('Use up to 200 protected terms, at most 200 characters each.');
      patch.humanizer.protectedTerms = [...new Set(terms.map(t => t.trim()).filter(Boolean))];
    }
  }
  if ('skills' in body) {
    if (!body.skills || !Array.isArray(body.skills.enabledIds) || Object.keys(body.skills).some(key => key !== 'enabledIds')) throw bad('Skill settings accept only enabledIds. Use the import action for new skills.');
    patch.skills = { ...config.skills, enabledIds: body.skills.enabledIds };
    try { resolveSkills(patch.skills, builtins); } catch (error) { throw bad(error.message); }
  }
  if ('strength' in body) {
    if (!['Light', 'Balanced', 'Strong'].includes(body.strength)) throw bad('Select Light, Balanced or Strong strength.');
    patch.strength = body.strength;
  }
  const models = patch.models || config.models;
  const selected = body.selectedModel ?? config.selectedModel;
  patch.selectedModel = models.some(m => m.id === selected && m.enabled && m.available) ? selected : models.find(m => m.enabled && m.available)?.id || '';
  return patch;
}
function connection(body, config) {
  let baseUrl; try { baseUrl = normalizeBaseUrl(body.baseUrl); } catch (error) { throw bad(error.message); }
  if ('apiKey' in body && (typeof body.apiKey !== 'string' || body.apiKey.length > 8192 || /[\r\n]/.test(body.apiKey))) throw bad('API key must be a single line of text.');
  return { baseUrl, apiKey: body.apiKey ?? (baseUrl === config.baseUrl ? config.apiKey : '') };
}

export async function createApp({ dataDir = process.env.HUMANIZER_DATA_DIR || resolve('data'), hipUrl = defaultHipUrl, detectorFetchImpl } = {}) {
  const store = new ConfigStore(dataDir); await store.init();
  const hip = new HipClient(hipUrl);
  const detectorStore = new DetectorStore(join(dataDir,'detectors')); await detectorStore.init();
  const detectorService = new DetectorService(detectorStore,{fetchImpl:detectorFetchImpl});
  const builtins = await loadBuiltinSkills();
  const publicSkills = () => ({ items: skillCatalog(store.get().skills, builtins), enabledIds: store.get().skills.enabledIds, limits: SKILL_LIMITS });
  const allowedHosts = new Set(['localhost', '127.0.0.1', '[::1]', ...(process.env.HUMANIZER_ALLOWED_HOSTS || '').split(',').map(h => h.trim()).filter(Boolean)]);
  let active = false;
  const app = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    try {
      let requestUrl;
      try { requestUrl = new URL(req.url, `http://${req.headers.host}`); } catch { throw bad('Invalid request URL.'); }
      if (!allowedHosts.has(requestUrl.hostname)) throw new AppError('Host is not allowed. Open this app through localhost.', 403);
      if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) throw new AppError('Cross-origin requests are not allowed.', 403);
      const route = requestUrl.pathname;
      if (req.method === 'GET' && route === '/api/health') return send(res, 200, { status: 'ok' });
      if (req.method === 'GET' && route === '/api/hip/status') return send(res, 200, await hip.status());
      if (req.method === 'GET' && route === '/api/detectors/settings') return send(res,200,detectorStore.public());
      if (req.method === 'GET' && route === '/api/skills') return send(res, 200, publicSkills());
      if (req.method === 'GET' && route === '/api/skills/download') {
        const skill = skillCatalog(store.get().skills, builtins).find(s => s.id === requestUrl.searchParams.get('id'));
        if (!skill) throw new AppError('Skill not found.', 404);
        res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8', 'Content-Disposition': `attachment; filename="${skill.name}.md"` });
        return res.end(skill.markdown);
      }
      if (req.method === 'GET' && route === '/api/settings') return send(res, 200, store.public());
      if (req.method === 'GET' && files.has(route)) {
        const [file, type] = files.get(route); const content = await readFile(join(publicDir, file));
        res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` }); return res.end(content);
      }
      if (!['POST', 'PATCH'].includes(req.method)) return send(res, 404, { message: 'Endpoint not found.' });
      const body = await readJson(req); const config = store.get();
      if (req.method === 'PATCH' && route === '/api/detectors/settings') return send(res,200,await detectorStore.update(body));
      if (req.method === 'POST' && route === '/api/detectors/check') {
        const controller=new AbortController(); res.on('close',()=>controller.abort());
        const result=await detectorService.check(body,{signal:controller.signal});
        if(!res.destroyed)send(res,200,result);
        return;
      }
      if (req.method === 'POST' && route === '/api/skills/preview') {
        try { return send(res, 200, parseSkill(body.markdown)); } catch (error) { throw bad(error.message); }
      }
      if (req.method === 'POST' && ['/api/skills/import', '/api/skills/remove'].includes(route)) {
        await store.update(current => {
          try { return { skills: route.endsWith('/import') ? importSkill(current.skills, body.markdown, builtins) : removeSkill(current.skills, body.id) }; }
          catch (error) { throw bad(error.message); }
        });
        return send(res, 200, publicSkills());
      }
      if (req.method === 'POST' && ['/api/connection', '/api/connection/test'].includes(route)) {
        const credentials = connection(body, config);
        const found = await discoverModels(credentials);
        const models = mergeModels(credentials.baseUrl === config.baseUrl ? config.models : [], found);
        if (route.endsWith('/test')) return send(res, 200, { connected: true, count: models.filter(m => m.available).length });
        return send(res, 200, await store.update(current => {
          const models = mergeModels(credentials.baseUrl === current.baseUrl ? current.models : [], found);
          const selectedModel = models.find(m => m.id === current.selectedModel && m.enabled && m.available)?.id || models.find(m => m.enabled && m.available)?.id || '';
          return { ...credentials, models, selectedModel };
        }));
      }
      if (req.method === 'POST' && route === '/api/models/refresh') {
        if (!config.baseUrl) throw bad('Connect your LLM first.');
        const found = await discoverModels(config);
        return send(res, 200, await store.update(current => {
          if (current.baseUrl !== config.baseUrl || current.apiKey !== config.apiKey) throw new AppError('The connection changed during model discovery. Refresh Models again.', 409);
          const models = mergeModels(current.models, found);
          const selectedModel = models.find(m => m.id === current.selectedModel && m.enabled && m.available)?.id || models.find(m => m.enabled && m.available)?.id || '';
          return { models, selectedModel };
        }));
      }
      if (req.method === 'PATCH' && route === '/api/settings') return send(res, 200, await store.update(current => settingsPatch(body, current, builtins)));
      if (req.method === 'POST' && route === '/api/punctuation') {
        if (!config.baseUrl) throw bad('Connect a second model in Settings to correct punctuation.');
        if (!config.models.some(m => m.id === body.model && m.enabled && m.available)) throw bad('Select an enabled, available second model.');
        if (Object.keys(body).some(key => !['model','text'].includes(key))) throw bad('Punctuation accepts only text and model.');
        if (active) throw new AppError('A rewrite is already running. Stop it or wait for it to finish.',409);
        active=true; const controller=new AbortController();
        res.on('close',()=>controller.abort());
        try { return send(res,200,await proofreadPunctuation(config,{model:body.model,text:body.text},controller.signal)); }
        finally { active=false; }
      }
      if (req.method === 'POST' && route === '/api/humanize') {
        if (config.engine.kind === 'hip') {
          if (active) throw new AppError('A rewrite is already running. Stop it or wait for it to finish.',409);
          hipInput(body.text,config.humanizer.protectedTerms);
          active=true; const controller=new AbortController();
          res.on('close',()=>controller.abort());
          res.writeHead(200,{'Content-Type':'application/x-ndjson; charset=utf-8','X-Accel-Buffering':'no'});
          const emit=event=>{if(!res.destroyed)res.write(JSON.stringify(event)+'\n');};
          emit({type:'start',chunks:1});
          try { await runHip(hip,body.text,config,emit,controller.signal); }
          catch(error) {if(!controller.signal.aborted)emit({type:'error',message:error instanceof AppError?error.message:'HIP rewrite failed. Result discarded.'});}
          finally {active=false;res.end();}
          return;
        }
        if (!config.baseUrl) throw bad('Connect your LLM first.');
        if (active) throw new AppError('A rewrite is already running. Stop it or wait for it to finish.', 409);
        if (typeof body.text !== 'string' || !body.text.trim()) throw bad('Enter some original text.');
        if (body.text.length > 200_000) throw bad('Text exceeds 200,000 characters. Split it into smaller documents.');
        if (!config.models.some(m => m.id === body.model && m.enabled && m.available)) throw bad('This model is disabled or unavailable. Select an enabled model, or refresh Models in Settings.');
        if (!['Light', 'Balanced', 'Strong'].includes(body.strength)) throw bad('Select a valid strength.');
        let selectedSkills;
        try { selectedSkills = resolveSkills(config.skills, builtins); } catch (error) { throw bad(error.message); }
        let chunks; try { chunks = splitText(body.text, config.humanizer.chunkChars); } catch (error) { throw bad(error.message); }
        active = true; const controller = new AbortController();
        res.on('close', () => controller.abort());
        res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'X-Accel-Buffering': 'no' });
        const emit = event => { if (!res.destroyed) res.write(JSON.stringify(event) + '\n'); };
        emit({ type: 'start', chunks: chunks.length });
        let result = '';
        try {
          for (const [index, chunk] of chunks.entries()) {
            controller.signal.throwIfAborted();
            const protectedText = protectText(chunk.text, config.humanizer.protectedTerms);
            const input = {
              model: body.model, strength: body.strength, text: protectedText.text, skills: selectedSkills, tone: config.writing.tone,
              context: { preceding: chunks[index - 1]?.text.slice(-1500) || '', following: chunks[index + 1]?.text.slice(0, 750) || '' },
            };
            let raw; let restored;
            for (const stage of config.writing.review ? ['draft', 'review'] : ['draft']) {
              controller.signal.throwIfAborted();
              emit({ type: 'progress', current: index + 1, total: chunks.length, stage });
              if (stage === 'review') emit({ type: 'replace', text: result });
              let partial = ''; let published = '';
              raw = await rewrite(config, { ...input, ...(stage === 'review' ? { draft: raw } : {}) }, delta => {
                partial += delta;
                const preview = protectedText.preview(partial);
                if (preview.startsWith(published)) {
                  const addition = preview.slice(published.length);
                  if (addition) emit({ type: 'delta', text: addition });
                } else emit({ type: 'replace', text: result + preview });
                published = preview;
              }, controller.signal);
              // Remove model-added outer blank lines without stripping indentation
              // from source code or deliberate outer blank lines in the input.
              if (!/^[ \t]*\r?\n/.test(chunk.text)) raw = raw.replace(/^(?:[ \t]*\r?\n)+/, '');
              if (!/\r?\n[ \t]*$/.test(chunk.text)) raw = raw.replace(/(?:\r?\n[ \t]*)+$/, '');
              restored = protectedText.restore(raw);
              const issues = validateFacts(chunk.text, restored, config.humanizer.protectedTerms);
              if (issues.length) throw new AppError(`Fact preservation check failed (${stage}). ${issues.slice(0, 5).join('; ')}. The result was discarded. Try Light strength or a different model.`, 422, 'preservation');
            }
            result += restored + chunk.separator;
            emit({ type: 'replace', text: result });
          }
          const issues = validateFacts(body.text, result, config.humanizer.protectedTerms);
          if (issues.length) throw new AppError('The final fact preservation check failed. The result was discarded.', 422, 'preservation');
          emit({ type: 'done', text: result, chunks: chunks.length, reviewed: config.writing.review, tone: config.writing.tone, skills: selectedSkills.map(s => ({ id: s.id, title: s.title })), writingNotes: compareWriting(body.text, result, config.humanizer.protectedTerms) });
        } catch (error) {
          if (!controller.signal.aborted) emit({ type: 'error', message: error instanceof AppError || /protected/i.test(error.message) ? error.message : 'Rewrite failed. Check the LLM connection and try again.' });
        } finally { active = false; res.end(); }
        return;
      }
      return send(res, 404, { message: 'Endpoint not found.' });
    } catch (error) {
      if (!res.headersSent) send(res, error instanceof AppError ? error.status : 500, { message: error instanceof AppError ? error.message : 'Local settings could not be saved or read. Check the data directory permissions and available disk space.' });
      else res.end();
    }
  });
  app.requestTimeout = 30_000;
  return app;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const app = await createApp(); const port = Number(process.env.PORT || 3000); const host = process.env.HOST || '127.0.0.1';
    app.listen(port, host, () => console.log(`Humanizer is ready at http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`));
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { app.close(); app.closeAllConnections(); });
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
