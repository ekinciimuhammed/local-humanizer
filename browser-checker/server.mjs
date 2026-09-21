import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { BrowserCheckError, CHECK_TIMEOUT_MS, runPublicCheck, validateText } from './checker.mjs';

const hosts = new Set(['127.0.0.1', 'localhost', '[::1]', 'host.docker.internal', 'browser-checker']);
function send(res, status, body) {
  if (!res.destroyed) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(body)); }
}
async function readInput(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new BrowserCheckError('Expected JSON.', 400, 'invalid_request');
  const chunks = []; let bytes = 0;
  for await (const chunk of req) { bytes += chunk.length; if (bytes > 100_000) throw new BrowserCheckError('Request too large.', 413, 'invalid_request'); chunks.push(chunk); }
  let body; try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new BrowserCheckError('Invalid JSON.', 400, 'invalid_request'); }
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => key !== 'text')) throw new BrowserCheckError('Only text is accepted.', 400, 'invalid_request');
  validateText(body.text); return body.text;
}
export function createBrowserChecker({ checkImpl = runPublicCheck, timeoutMs = CHECK_TIMEOUT_MS } = {}) {
  let active = false;
  const server = http.createServer(async (req, res) => {
    try {
      let url, authority; try { authority = new URL(`http://${req.headers.host}`); url = new URL(req.url, authority); } catch { throw new BrowserCheckError('Invalid host.', 403, 'forbidden'); }
      if (!hosts.has(authority.hostname) || authority.origin !== url.origin || req.headers.origin !== undefined || req.headers['x-humanizer-browser-checker'] !== '1') throw new BrowserCheckError('Only local Humanizer worker requests are accepted.', 403, 'forbidden');
      if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { status: active ? 'busy' : 'ready', experimental: true });
      if (req.method !== 'POST' || url.pathname !== '/check') return send(res, 404, { code: 'not_found', message: 'Endpoint not found.' });
      const text = await readInput(req);
      if (req.aborted || res.destroyed) throw new BrowserCheckError('Website check cancelled.', 499, 'cancelled');
      if (active) throw new BrowserCheckError('A website check is already running.', 409, 'busy');
      active = true;
      const controller = new AbortController();
      const cancel = () => controller.abort(new BrowserCheckError('Website check cancelled.', 499, 'cancelled'));
      res.on('close', cancel);
      const timer = setTimeout(() => controller.abort(new BrowserCheckError('Website check timed out.', 504, 'timeout')), Math.max(1, Math.min(CHECK_TIMEOUT_MS, timeoutMs)));
      let rejectAbort;
      const aborted = new Promise((_, reject) => { rejectAbort = () => reject(controller.signal.reason); controller.signal.addEventListener('abort', rejectAbort, { once: true }); });
      try {
        const result = await Promise.race([checkImpl(text, { signal: controller.signal }), aborted]);
        controller.signal.throwIfAborted();
        return send(res, 200, { percentage: result.percentage, textHash: result.textHash, checkedAt: result.checkedAt });
      } finally { clearTimeout(timer); controller.signal.removeEventListener('abort', rejectAbort); res.removeListener('close', cancel); active = false; }
    } catch (error) {
      const safe = error instanceof BrowserCheckError ? error : new BrowserCheckError('The browser helper failed. No score is available.', 502, 'browser_error');
      send(res, safe.status, { code: safe.code, message: safe.message });
    }
  });
  server.requestTimeout = 10_000; server.headersTimeout = 10_000; server.keepAliveTimeout = 2_000;
  return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createBrowserChecker(); server.listen(Number(process.env.PORT || 18083), process.env.HOST || '127.0.0.1');
  const stop = () => { server.close(); server.closeAllConnections(); };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
}
