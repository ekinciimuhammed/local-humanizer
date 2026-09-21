import { buildMessages } from './prompt.mjs';

export class AppError extends Error {
  constructor(message, status = 502, code = 'provider_error') { super(message); this.status = status; this.code = code; }
}

function transportError(error, signal) {
  if (error instanceof AppError) return error;
  if (signal?.aborted) return new AppError(signal.reason?.name === 'TimeoutError' ? 'LLM request timed out. Increase Timeout in Settings or check the server.' : 'Request cancelled.', 504, 'aborted');
  const code = error.cause?.code || error.code;
  if (code === 'ECONNREFUSED') return new AppError('Connection refused. Check that your LLM server is running and that the Base URL is reachable from this app.');
  if (['ENOTFOUND', 'EAI_AGAIN'].includes(code)) return new AppError('LLM hostname could not be resolved. Check your Base URL and local network.');
  if (/CERT|TLS|SSL/.test(code || '')) return new AppError('TLS certificate validation failed. Use a trusted certificate or configure NODE_EXTRA_CA_CERTS for your local CA.');
  return new AppError('Connection to the LLM server failed or was interrupted. Check the server and Base URL.');
}
async function limitedText(response, max = 2_000_000) {
  let text = ''; const decoder = new TextDecoder();
  for await (const part of response.body) {
    text += decoder.decode(part, { stream: true });
    if (text.length > max) throw new AppError('LLM response exceeded the supported size.');
  }
  return text + decoder.decode();
}
async function upstreamError(response, operation) {
  const body = await limitedText(response, 64_000);
  const status = response.status;
  if (status >= 300 && status < 400) return new AppError('The LLM endpoint returned a redirect. Enter its final Base URL; redirects are not followed.', 502);
  if (status === 401) return new AppError('401 Unauthorized. Check your API key.', 502);
  if (status === 403) return new AppError('403 Forbidden. Your API key does not have access to this endpoint or model.', 502);
  if (status === 404) return new AppError(operation === 'models' ? '404 Models endpoint not found. Check the Base URL and /v1 path.' : '404 Model or chat endpoint not found. Refresh Models and check the selected model.', 502);
  if (status === 429) return new AppError('429 Rate limit reached. Wait briefly, then try again.', 502);
  if (/context_length|context window|maximum context|too many tokens/i.test(body)) return new AppError('Context length exceeded. Reduce Chunk size or Max tokens in Settings, then try again.', 502);
  if ([400, 422, 501].includes(status) && /stream/i.test(body) && /not support|unsupported|not allowed|invalid|not implement/i.test(body)) return new AppError('This endpoint does not support streaming.', 502, 'stream_unsupported');
  if (status >= 500) return new AppError(`${status} LLM server error. Check the inference server and try again.`, 502);
  return new AppError(`${status} ${response.statusText || 'Request rejected'}. Check that the model supports chat completions and the configured generation parameters.`, 502);
}
async function request(config, path, options, signal) {
  try {
    const response = await fetch(`${config.baseUrl}${path}`, {
      ...options, signal, redirect: 'manual',
      headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}) },
    });
    if (!response.ok) throw await upstreamError(response, path === '/models' ? 'models' : 'chat');
    return response;
  } catch (error) { throw transportError(error, signal); }
}

export async function discoverModels(config, signal) {
  const timeout = AbortSignal.timeout(15_000);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  try {
    const response = await request(config, '/models', { method: 'GET' }, combined);
    let data;
    try { data = JSON.parse(await limitedText(response)); } catch (error) { if (error instanceof SyntaxError) throw new AppError('Invalid models response: the endpoint did not return JSON.'); throw error; }
    if (!Array.isArray(data.data)) throw new AppError('Invalid models response: expected { "data": [{ "id": "model" }] }.');
    if (data.data.length > 10_000) throw new AppError('The models endpoint returned too many entries (limit: 10,000).');
    return data.data;
  } catch (error) { throw transportError(error, combined); }
}

function checkFinish(reason) {
  if (reason === 'length') throw new AppError('The response reached the token limit and was truncated. Increase Max tokens or reduce Chunk size in Settings.');
  if (reason && reason !== 'stop') throw new AppError(`The model did not complete a text rewrite (${['content_filter', 'tool_calls', 'function_call'].includes(reason) ? reason : 'unsupported finish reason'}). Try another text model.`);
}
function contentText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.filter(p => p.type === 'text' && typeof p.text === 'string').map(p => p.text).join('');
  return '';
}
async function consume(response, onDelta) {
  if (!response.headers.get('content-type')?.includes('text/event-stream')) {
    let data;
    try { data = JSON.parse(await limitedText(response)); } catch (error) { if (error instanceof SyntaxError) throw new AppError('Invalid chat response: expected JSON or an SSE stream.'); throw error; }
    if (data.error) throw new AppError('The LLM returned an error inside its response. Check the model and server logs.');
    const choice = data.choices?.[0]; checkFinish(choice?.finish_reason);
    const result = contentText(choice?.message?.content);
    if (!result.trim()) throw new AppError('The model returned an empty answer. Try another text model or increase Max tokens.');
    onDelta(result); return result;
  }
  let buffer = ''; let result = ''; let completed = false; const decoder = new TextDecoder();
  const handle = frame => {
    const data = frame.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n').trim();
    if (!data) return;
    if (data === '[DONE]') { completed = true; return; }
    let event;
    try { event = JSON.parse(data); } catch { throw new AppError('The LLM stream contained invalid JSON. The partial result was discarded.'); }
    if (event.error) throw new AppError('The LLM reported an error while streaming. The partial result was discarded.');
    const choice = event.choices?.[0]; if (!choice) return;
    checkFinish(choice.finish_reason);
    if (choice.finish_reason === 'stop') completed = true;
    const delta = contentText(choice.delta?.content);
    result += delta;
    if (result.length > 1_000_000) throw new AppError('LLM output exceeded the supported size.');
    if (delta) onDelta(delta);
  };
  for await (const bytes of response.body) {
    buffer += decoder.decode(bytes, { stream: true });
    // CRLF may itself be split over network chunks; only normalize complete CRLF pairs.
    buffer = buffer.replaceAll('\r\n', '\n');
    let boundary;
    while ((boundary = buffer.indexOf('\n\n')) !== -1) {
      handle(buffer.slice(0, boundary)); buffer = buffer.slice(boundary + 2);
    }
    if (buffer.length > 1_000_000) throw new AppError('An LLM stream event exceeded the supported size.');
  }
  buffer += decoder.decode();
  if (buffer.trim()) handle(buffer);
  if (!completed) throw new AppError('The stream was interrupted before completion. The partial result was discarded.');
  if (!result.trim()) throw new AppError('The model returned an empty answer. Try another text model or increase Max tokens.');
  return result;
}

export async function rewrite(config, { model, strength, text, context, skills = [], tone, draft }, onDelta, signal) {
  const timeout = AbortSignal.timeout(config.generation.timeoutSeconds * 1000);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const body = {
    model, messages: buildMessages({ strength, text, context, skills, tone, draft }),
    temperature: config.generation.temperature, top_p: config.generation.topP, max_tokens: config.generation.maxTokens,
    stream: config.generation.streaming,
  };
  try {
    let response;
    try { response = await request(config, '/chat/completions', { method: 'POST', body: JSON.stringify(body) }, combined); }
    catch (error) {
      if (!body.stream || error.code !== 'stream_unsupported') throw error;
      body.stream = false;
      response = await request(config, '/chat/completions', { method: 'POST', body: JSON.stringify(body) }, combined);
    }
    return await consume(response, onDelta);
  } catch (error) { throw transportError(error, combined); }
}
