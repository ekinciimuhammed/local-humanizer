import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { DEFAULT_SKILL_IDS } from './skills.mjs';

export const defaults = Object.freeze({
  baseUrl: '', apiKey: '', models: [], selectedModel: '', strength: 'Balanced',
  generation: { temperature: 0.45, topP: 0.95, maxTokens: 4096, streaming: true, timeoutSeconds: 120 },
  humanizer: { chunkChars: 6000, protectedTerms: [] },
  writing: { tone: 'Original', review: false },
  skills: { enabledIds: [...DEFAULT_SKILL_IDS], custom: [] },
});

export class ConfigStore {
  #state = structuredClone(defaults);
  #key;
  #queue = Promise.resolve();
  constructor(directory) { this.directory = directory; }
  async init() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    await chmod(this.directory, 0o700);
    const keyPath = join(this.directory, 'credential.key');
    try { await writeFile(keyPath, randomBytes(32), { flag: 'wx', mode: 0o600 }); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    await chmod(keyPath, 0o600);
    this.#key = await readFile(keyPath);
    if (this.#key.length !== 32) throw new Error('Local credential key is invalid. Restore data/ from your backup.');
    try {
      const saved = JSON.parse(await readFile(join(this.directory, 'settings.json'), 'utf8'));
      const { encryptedApiKey, ...settings } = saved;
      this.#state = { ...structuredClone(defaults), ...settings, apiKey: this.#decrypt(encryptedApiKey) };
      await chmod(join(this.directory, 'settings.json'), 0o600);
    } catch (error) {
      if (error.code !== 'ENOENT') throw new Error('Local settings could not be read or decrypted. Restore settings.json and credential.key together from backup.');
    }
  }
  #decrypt(value) {
    if (!value) return '';
    const bytes = Buffer.from(value, 'base64');
    const decipher = createDecipheriv('aes-256-gcm', this.#key, bytes.subarray(0, 12));
    decipher.setAuthTag(bytes.subarray(12, 28));
    return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8');
  }
  #encrypt(value) {
    if (!value) return '';
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.#key, iv);
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64');
  }
  get() { return structuredClone(this.#state); }
  public() {
    const { apiKey, ...settings } = this.get();
    return { ...settings, hasApiKey: Boolean(apiKey) };
  }
  update(patch) {
    const operation = this.#queue.then(async () => {
      const changes = typeof patch === 'function' ? patch(this.get()) : patch;
      const next = { ...this.#state, ...structuredClone(changes) };
      const { apiKey, ...settings } = next;
      const path = join(this.directory, 'settings.json');
      const temporary = `${path}.${randomBytes(6).toString('hex')}.tmp`;
      await writeFile(temporary, JSON.stringify({ ...settings, encryptedApiKey: this.#encrypt(apiKey) }, null, 2), { mode: 0o600 });
      await rename(temporary, path);
      this.#state = next;
      return this.public();
    });
    this.#queue = operation.catch(() => {});
    return operation;
  }
}
