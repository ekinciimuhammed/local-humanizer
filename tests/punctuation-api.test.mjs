import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ConfigStore} from '../src/config.mjs';
import {createApp} from '../src/server.mjs';

test('punctuation route requires an enabled model and returns a separate corrected draft without changing settings',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'punctuation-api-'));let calls=0;
 const provider=http.createServer(async(req,res)=>{let raw='';for await(const b of req)raw+=b;calls++;const body=JSON.parse(raw);assert.equal(body.model,'fixture');res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify([{before:'decision making',after:'decision-making'}])}}]}));});
 await new Promise(r=>provider.listen(0,'127.0.0.1',r));
 const store=new ConfigStore(dir);await store.init();await store.update({baseUrl:`http://127.0.0.1:${provider.address().port}/v1`,apiKey:'fixture-only',models:[{id:'fixture',enabled:true,available:true}],selectedModel:'fixture',engine:{kind:'hip',hipRounds:1}});
 const app=await createApp({dataDir:dir});await new Promise(r=>app.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${app.address().port}`;
 const call=body=>fetch(base+'/api/punctuation',{method:'POST',headers:{'Content-Type':'application/json','X-Humanizer-Request':'1'},body:JSON.stringify(body)});
 try{
  const before=await (await fetch(base+'/api/settings')).json();
  assert.equal((await call({text:'Clear decision making.',model:'disabled'})).status,400);assert.equal(calls,0);
  const response=await call({text:'Clear decision making.',model:'fixture'});assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{text:'Clear decision-making.',changed:true});assert.equal(calls,1);
  assert.deepEqual(await (await fetch(base+'/api/settings')).json(),before);
  const csrf=await fetch(base+'/api/punctuation',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(csrf.status,403);assert.equal(calls,1);
 }finally{app.closeAllConnections();provider.closeAllConnections();await Promise.all([new Promise(r=>app.close(r)),new Promise(r=>provider.close(r))]);await rm(dir,{recursive:true,force:true});}
});
