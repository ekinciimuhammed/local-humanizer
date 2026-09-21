import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.mjs';

async function fixture(run) {
  const dir = await mkdtemp(join(tmpdir(), 'humanizer-hip-'));
  const calls = []; let mode = 'ok';
  const worker = http.createServer(async (req, res) => {
    assert.equal(req.headers['x-humanizer-worker'], '1');
    let raw = ''; for await (const part of req) raw += part;
    const body = raw ? JSON.parse(raw) : null;
    calls.push({ path: req.url, body });
    if (req.url === '/rewrite' && mode === 'wait') return;
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/health') return res.end(JSON.stringify({ status: 'ready', device: 'cpu', model: 'HIP' }));
    if (req.url === '/cancel') return res.end('{}');
    if (mode === 'redirect') { res.writeHead(302, { Location: 'http://127.0.0.1:1' }); return res.end(); }
    res.end(JSON.stringify({ text: mode === 'facts' ? 'The study found 51 participants.' : mode === 'empty' ? '' : body.text.replace('It is important to note that ', '') }));
  });
  await new Promise(r => worker.listen(0, '127.0.0.1', r));
  const app = await createApp({ dataDir: dir, hipUrl: `http://127.0.0.1:${worker.address().port}` });
  await new Promise(r => app.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${app.address().port}`;
  const call = (path, body, method='POST', signal) => fetch(base + path, { method, signal, headers: { 'Content-Type': 'application/json', 'X-Humanizer-Request':'1' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const rewrite = async text => (await (await call('/api/humanize', { text })).text()).trim().split('\n').map(JSON.parse);
  try { await run({ call, rewrite, calls, mode: value => { mode=value; } }); }
  finally { app.closeAllConnections(); worker.closeAllConnections(); await Promise.all([new Promise(r => app.close(r)), new Promise(r => worker.close(r))]); await rm(dir, {recursive:true,force:true}); }
}

test('HIP engine is opt-in, validates rounds, and works independently of provider credentials', () => fixture(async ({call,rewrite,calls}) => {
  const config = await (await call('/api/settings',null,'GET')).json();
  assert.deepEqual(config.engine,{ kind:'connected', hipRounds:1 });
  for (const engine of [{kind:'unknown'},{hipRounds:3},{hipRounds:1.5},{hipUrl:'https://example.com'}]) assert.equal((await call('/api/settings',{engine},'PATCH')).status,400);
  await call('/api/settings',{engine:{kind:'hip'}},'PATCH');
  const status = await (await call('/api/hip/status',null,'GET')).json(); assert.equal(status.ready,true);
  const events = await rewrite('It is important to note that the study found 50 participants.');
  assert.equal(events.at(-1).type,'done'); assert.equal(events.at(-1).engine,'hip');
  assert.equal(events.at(-1).text,'the study found 50 participants.');
  assert.equal(calls.filter(c=>c.path==='/rewrite').length,1);
  assert.deepEqual(Object.keys(calls.find(c=>c.path==='/rewrite').body).sort(),['id','seed','text','timeoutSeconds']);
  assert.equal((await (await call('/api/settings',null,'GET')).json()).baseUrl,'');
}));

test('HIP second pass is bounded and both passes are checked against original facts', () => fixture(async ({call,rewrite,calls,mode}) => {
  await call('/api/settings',{engine:{kind:'hip',hipRounds:2},writing:{review:true}},'PATCH');
  const events = await rewrite('It is important to note that the study found 50 participants.');
  assert.equal(events.at(-1).type,'done'); assert.equal(events.at(-1).rounds,2);
  assert.equal(calls.filter(c=>c.path==='/rewrite').length,2);
  mode('facts');
  const fail = await rewrite('The study found 50 participants.');
  assert.equal(fail.at(-1).type,'error'); assert.match(fail.at(-1).message,/preservation/i);
}));

test('explicit four-pass HIP stops after four calls and rejects unbounded settings', () => fixture(async ({call,rewrite,calls}) => {
  assert.equal((await call('/api/settings',{engine:{kind:'hip',hipRounds:4}},'PATCH')).status,200);
  assert.equal((await call('/api/settings',{engine:{hipRounds:5}},'PATCH')).status,400);
  const events=await rewrite('The study found 50 participants.');
  assert.equal(events.at(-1).type,'done');assert.equal(events.at(-1).rounds,4);
  assert.equal(calls.filter(c=>c.path==='/rewrite').length,4);
}));

test('HIP rejects protected/structured/oversized input before any worker call', () => fixture(async ({call,calls}) => {
  await call('/api/settings',{engine:{kind:'hip'}},'PATCH');
  for (const text of ['A quote: "Never change this."','Use `code` now.','# Heading\nA normal passage.','Read https://example.com today.','word '.repeat(1300),'<source_text>malformed']) {
    assert.equal((await call('/api/humanize',{text})).status,400,text.slice(0,30));
  }
  assert.equal(calls.length,0);
}));

test('HIP empty output and redirect cannot become successful results', () => fixture(async ({call,rewrite,mode}) => {
  await call('/api/settings',{engine:{kind:'hip'}},'PATCH');
  for (const m of ['empty','redirect']) {mode(m); assert.equal((await rewrite('The text is clear.')).at(-1).type,'error');}
}));

test('HIP cancellation propagates to native worker', () => fixture(async ({call,calls,mode}) => {
  await call('/api/settings',{engine:{kind:'hip'}},'PATCH'); mode('wait');
  const abort = new AbortController();
  const response = await call('/api/humanize',{text:'The text is clear.'},'POST',abort.signal);
  for (let i=0;i<100 && !calls.some(c=>c.path==='/rewrite');i++) await new Promise(r=>setTimeout(r,5));
  abort.abort(); await response.body.cancel().catch(()=>{});
  for (let i=0;i<100 && !calls.some(c=>c.path==='/cancel');i++) await new Promise(r=>setTimeout(r,5));
  const original = calls.find(c=>c.path==='/rewrite');
  assert.ok(original); assert.equal(calls.find(c=>c.path==='/cancel')?.body.id,original.body.id);
}));
