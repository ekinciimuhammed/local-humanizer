import http from 'node:http';
import { pathToFileURL } from 'node:url';

export async function startMock(port = 0) {
  const state = { models: [{ id: 'local-editor' }, { id: 'text-embedding' }], mode: 'stream', calls: [], aborted: 0 };
  const server = http.createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    const data = body ? JSON.parse(body) : null;
    state.calls.push({ path: req.url, auth: req.headers.authorization, data });
    if (state.mode === 'unauthorized') { res.writeHead(401).end(JSON.stringify({ error: { message: 'secret-for-test' } })); return; }
    if (state.mode === 'redirect') { res.writeHead(307, { Location: 'http://127.0.0.1:1/elsewhere' }).end(); return; }
    if (state.mode === 'server-error') { res.writeHead(503).end('{}'); return; }
    if (state.mode === 'models-missing') { res.writeHead(404).end('{}'); return; }
    if (req.url.endsWith('/models')) { if (state.modelsGate) await state.modelsGate; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ data: state.models })); return; }
    if (!req.url.endsWith('/chat/completions')) { res.writeHead(404).end(); return; }
    if (state.mode === 'rate') { res.writeHead(429, { 'Retry-After': '2' }).end('{}'); return; }
    if (state.mode === 'context') { res.writeHead(400).end('{"error":{"code":"context_length_exceeded"}}'); return; }
    if (state.mode === 'fallback' && data.stream) { res.writeHead(400).end('{"error":{"message":"stream is not supported"}}'); return; }
    const input = JSON.parse(data.messages.at(-1).content);
    const reviewing = typeof input.draft === 'string';
    let text = input.text;
    text = text.replaceAll('It is important to note that ', '').replaceAll('önemle belirtmek gerekir ki ', '');
    if (state.mode === 'facts' || (state.mode === 'review-facts' && reviewing)) text = text.replace('2026', '2025');
    const truncated = state.mode === 'length' || (state.mode === 'review-length' && reviewing);
    if (state.mode === 'empty') text = '';
    if (!data.stream || state.mode === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ choices: [{ message: { content: text }, finish_reason: truncated ? 'length' : 'stop' }] })); return;
    }
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.on('close', () => { if (!res.writableEnded) state.aborted++; });
    if (state.mode === 'slow') {
      res.write(': waiting\n\n');
      const timer = setTimeout(() => res.end(), 10000); res.on('close', () => clearTimeout(timer)); return;
    }
    for (const chunk of text.match(/.{1,12}|\n/gu) || []) {
      const event = `data: ${JSON.stringify({ choices: [{ delta: { content: chunk } }] })}\r\n\r\n`;
      // Deliberately split SSE frames over network writes.
      res.write(event.slice(0, 11)); res.write(event.slice(11));
    }
    if (state.mode !== 'interrupted') {
      res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: truncated ? 'length' : 'stop' }] })}\n\n`);
      res.write('data: [DONE]\n\n');
    }
    res.end();
  });
  await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
  return { state, server, url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }) };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const mock = await startMock(Number(process.env.MOCK_PORT || 18080));
  console.log(`Local test provider: ${mock.url}/v1 (deterministic fixture, not an LLM)`);
}
