import { randomBytes, createCipheriv, createDecipheriv, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { AppError } from './provider.mjs';

const secrets = ['gptzeroApiKey', 'zerogptBearerToken', 'zerogptApiKey'];
const flags = ['enabled', 'autoCheck', 'compareSource'];
const defaults = { enabled: false, autoCheck: false, compareSource: false, provider: 'gptzero', gptzeroApiKey: '', zerogptBearerToken: '', zerogptApiKey: '' };
export const DETECTOR_LIMITS = Object.freeze({ maxChars: 50_000, timeoutMs: 30_000, maxResponseBytes: 1_000_000 });
const invalid = message => new AppError(message, 400, 'detector_input');
const hash = text => createHash('sha256').update(text).digest('hex');

function validatePatch(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch) || Object.keys(patch).some(key => !Object.hasOwn(defaults, key))) throw invalid('Invalid checker settings.');
  for (const key of flags) if (key in patch && typeof patch[key] !== 'boolean') throw invalid(`${key} must be enabled or disabled.`);
  if ('provider' in patch && !['gptzero', 'zerogpt'].includes(patch.provider)) throw invalid('Choose GPTZero or ZeroGPT.');
  for (const key of secrets) if (key in patch && (typeof patch[key] !== 'string' || patch[key].length > 8192 || /[^\x20-\x7e]/.test(patch[key]))) throw invalid('Checker credentials must be a single line of ASCII text, up to 8192 characters.');
  return structuredClone(patch);
}

// A dedicated store prevents detector credentials from entering LLM settings.
export class DetectorStore {
  #state = { ...defaults }; #key; #queue = Promise.resolve(); #revision = randomBytes(12).toString('hex');
  constructor(directory) { this.directory = directory; }
  async init() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 }); await chmod(this.directory, 0o700);
    const keyPath = join(this.directory, 'detector-credential.key');
    try { await writeFile(keyPath, randomBytes(32), { flag: 'wx', mode: 0o600 }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
    await chmod(keyPath, 0o600); this.#key = await readFile(keyPath);
    if (this.#key.length !== 32) throw new Error('The checker credential key is invalid. Restore checker settings and key together.');
    const path = join(this.directory, 'detector-settings.json');
    try {
      const { encryptedCredentials, ...settings } = JSON.parse(await readFile(path, 'utf8'));
      const bytes = Buffer.from(encryptedCredentials, 'base64');
      const decipher = createDecipheriv('aes-256-gcm', this.#key, bytes.subarray(0, 12)); decipher.setAuthTag(bytes.subarray(12, 28));
      const credentials = JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8'));
      this.#state = { ...defaults, ...validatePatch(settings), ...validatePatch(credentials) }; await chmod(path, 0o600);
    } catch (error) { if (error.code !== 'ENOENT') throw new Error('Checker settings could not be read or decrypted. Restore checker settings and key together.'); }
  }
  get() { return structuredClone(this.#state); }
  public() {
    const { enabled, autoCheck, compareSource, provider, gptzeroApiKey, zerogptBearerToken, zerogptApiKey } = this.#state;
    return { enabled, autoCheck, compareSource, provider, revision: this.#revision, hasGptzeroApiKey: Boolean(gptzeroApiKey), hasZerogptBearerToken: Boolean(zerogptBearerToken), hasZerogptApiKey: Boolean(zerogptApiKey) };
  }
  update(patch) {
    const operation = this.#queue.then(async () => {
      const next = { ...this.#state, ...validatePatch(patch) };
      const settings = {}, credentials = {};
      for (const [key, value] of Object.entries(next)) (secrets.includes(key) ? credentials : settings)[key] = value;
      const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', this.#key, iv);
      const encrypted = Buffer.concat([cipher.update(JSON.stringify(credentials), 'utf8'), cipher.final()]);
      const encryptedCredentials = Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
      const path = join(this.directory, 'detector-settings.json'), temporary = `${path}.${randomBytes(6).toString('hex')}.tmp`;
      await writeFile(temporary, JSON.stringify({ ...settings, encryptedCredentials }, null, 2), { mode: 0o600 });
      await rename(temporary, path); this.#state = next; this.#revision = randomBytes(12).toString('hex'); return this.public();
    });
    this.#queue = operation.catch(() => {}); return operation;
  }
}

function normalize(provider, body) {
  if (provider === 'gptzero') {
    const doc = body?.documents?.[0], p = doc?.class_probabilities;
    if (!p || ['ai', 'mixed', 'human'].some(key => typeof p[key] !== 'number' || !Number.isFinite(p[key]) || p[key] < 0 || p[key] > 1)) throw new AppError('GPTZero returned an unsupported response: expected three class probabilities. No score is available.', 502, 'detector_schema');
    return { metrics: { ai: p.ai, mixed: p.mixed, human: p.human }, classification: ['AI_ONLY', 'MIXED', 'HUMAN_ONLY'].includes(doc.document_classification) ? doc.document_classification : null, detectorVersion: typeof body.version === 'string' ? body.version.slice(0, 100) : null };
  }
  const percentage = body?.data?.fakePercentage;
  if (body?.success === false || typeof percentage !== 'number' || !Number.isFinite(percentage) || percentage < 0 || percentage > 100) throw new AppError('ZeroGPT returned an unsupported response: expected a percentage from 0 to 100. No score is available.', 502, 'detector_schema');
  return { metrics: { fakePercentage: percentage }, classification: null, detectorVersion: null };
}

export class DetectorService {
  #cache = new Map(); #active = false;
  constructor(store, { fetchImpl = fetch, timeoutMs = DETECTOR_LIMITS.timeoutMs, maxResponseBytes = DETECTOR_LIMITS.maxResponseBytes } = {}) {
    this.store = store; this.fetchImpl = fetchImpl;
    this.timeoutMs = Math.max(1, Math.min(DETECTOR_LIMITS.timeoutMs, timeoutMs));
    this.maxResponseBytes = Math.max(1, Math.min(DETECTOR_LIMITS.maxResponseBytes, maxResponseBytes));
  }
  async check(input, { signal } = {}) {
    const config = this.store.get();
    if (!config.enabled) throw invalid('External checking is disabled. Enable it in Settings first.');
    if (config.provider === 'gptzero' ? !config.gptzeroApiKey.trim() : !(config.zerogptBearerToken.trim() || config.zerogptApiKey.trim())) throw invalid('Add credentials for this checker in Settings first. An API key or bearer token is required.');
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['source', 'result', 'provider', 'settingsRevision', 'automatic'].includes(key))) throw invalid('Invalid checker request.');
    if (!['gptzero', 'zerogpt'].includes(input.provider) || typeof input.settingsRevision !== 'string' || !/^[a-f0-9]{24}$/.test(input.settingsRevision) || typeof input.automatic !== 'boolean') throw invalid('Checker requests require the displayed provider, settings revision and automatic-check choice. Reload checker settings.');
    const signature = this.store.public().revision;
    if (input.provider !== config.provider || input.settingsRevision !== signature) throw new AppError('Checker settings changed in another tab or since restarting. Reload checker settings before sending text.', 409, 'detector_stale');
    if (input.automatic && !config.autoCheck) throw invalid('Automatic external checking is disabled. Enable it in checker settings first.');
    const entries = config.compareSource ? [['source', input.source], ['result', input.result]] : [['result', input.result]];
    for (const [name, text] of entries) if (typeof text !== 'string' || !text.trim() || text.length > DETECTOR_LIMITS.maxChars) throw invalid(`Checker ${name} must contain 1–50,000 characters. Text is never truncated.`);
    if (this.#active) throw new AppError('A checker request is already running. Wait or cancel it first.', 409, 'detector_busy');
    const controller = new AbortController();
    const cancelled = () => controller.abort(new AppError('Checker request cancelled.', 499, 'detector_cancelled'));
    if (signal?.aborted) cancelled(); else signal?.addEventListener('abort', cancelled, { once: true });
    const timer = setTimeout(() => controller.abort(new AppError('Checker request timed out. No score is available.', 504, 'detector_timeout')), this.timeoutMs);
    let rejectAbort;
    const aborted = new Promise((_, reject) => { rejectAbort = () => reject(controller.signal.reason); controller.signal.addEventListener('abort', rejectAbort, { once: true }); });
    const current = () => {
      controller.signal.throwIfAborted();
      if (signature !== this.store.public().revision) throw new AppError('Checker settings changed. The old response was discarded.', 409, 'detector_stale');
    };
    this.#active = true;
    try {
      current();
      const work = async () => {
        const results = { provider: config.provider };
        for (const [name, text] of entries) {
          current(); const textHash = hash(text), cacheKey = `${signature}:${textHash}`;
          const cached = this.#cache.get(cacheKey);
          if (cached && Date.now() - cached.time < 10 * 60_000) { results[name] = structuredClone(cached.scan); continue; }
          const scan = { ...await this.#scan(config, text, controller.signal), textHash, checkedAt: new Date().toISOString() };
          current(); this.#cache.set(cacheKey, { time: Date.now(), scan });
          if (this.#cache.size > 50) this.#cache.delete(this.#cache.keys().next().value);
          results[name] = structuredClone(scan);
        }
        current(); return results;
      };
      return await Promise.race([work(), aborted]);
    } catch (error) {
      if (controller.signal.aborted) throw controller.signal.reason;
      if (error instanceof AppError) throw error;
      throw new AppError('The external checker could not be reached or returned an invalid response. No score is available.', 502, 'detector_network');
    } finally {
      clearTimeout(timer); signal?.removeEventListener('abort', cancelled); controller.signal.removeEventListener('abort', rejectAbort); this.#active = false;
    }
  }
  async #scan(config, text, signal) {
    const isGpt = config.provider === 'gptzero';
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
    if (isGpt) headers['x-api-key'] = config.gptzeroApiKey;
    else {
      if (config.zerogptBearerToken) headers.Authorization = `Bearer ${config.zerogptBearerToken}`;
      if (config.zerogptApiKey) headers.ApiKey = config.zerogptApiKey;
    }
    const response = await this.fetchImpl(isGpt ? 'https://api.gptzero.me/v2/predict/text' : 'https://api.zerogpt.com/api/detect/detectText', {
      method: 'POST', headers, body: JSON.stringify(isGpt ? { document: text } : { input_text: text }), signal, redirect: 'error',
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      const detail = [401, 403].includes(response.status) ? 'Check your checker credentials and account access.' : response.status === 429 ? 'Checker quota or rate limit reached. Try again later.' : [400, 413, 422].includes(response.status) ? 'The checker rejected this text. Check its supported language and account text limits.' : 'The external checker rejected the request.';
      throw new AppError(`${response.status} ${detail} No score is available.`, 502, 'detector_upstream');
    }
    if (!response.body) throw new AppError('The checker returned an empty response. No score is available.', 502, 'detector_schema');
    const reader = response.body.getReader(), chunks = []; let size = 0;
    try {
      while (true) {
        signal.throwIfAborted(); const { done, value } = await reader.read(); if (done) break;
        size += value.byteLength; if (size > this.maxResponseBytes) throw new AppError('Checker response exceeded the supported size. No score is available.', 502, 'detector_size');
        chunks.push(value);
      }
      return normalize(config.provider, JSON.parse(Buffer.concat(chunks).toString('utf8')));
    } finally { await reader.cancel().catch(() => {}); }
  }
}
