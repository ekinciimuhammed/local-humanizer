import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.mjs';

test('checker HTTP routes keep credentials separate and never send text while disabled',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'humanizer-checker-api-')); const calls=[];
  const app=await createApp({dataDir:dir,detectorFetchImpl:async(url,options)=>{
    calls.push({url,options});
    return new Response(JSON.stringify({documents:[{class_probabilities:{ai:0.7,mixed:0.2,human:0.1},document_classification:'AI_ONLY'}]}));
  }});
  await new Promise(r=>app.listen(0,'127.0.0.1',r)); const base=`http://127.0.0.1:${app.address().port}`;
  const call=(path,body,method='POST')=>fetch(base+path,{method,headers:{'Content-Type':'application/json','X-Humanizer-Request':'1'},...(body?{body:JSON.stringify(body)}:{})});
  try {
    assert.equal((await call('/api/detectors/check',{result:'Some prose.'})).status,400); assert.equal(calls.length,0);
    const saved=await (await call('/api/detectors/settings',{enabled:true,gptzeroApiKey:'test-only-detector-key',compareSource:true},'PATCH')).json();
    assert.equal(saved.hasGptzeroApiKey,true); assert.equal(JSON.stringify(saved).includes('test-only-detector-key'),false);
    const main=await (await call('/api/settings',null,'GET')).json(); assert.equal(main.hasApiKey,false); assert.equal(JSON.stringify(main).includes('test-only-detector-key'),false);
    const result=await (await call('/api/detectors/check',{provider:saved.provider,settingsRevision:saved.revision,automatic:false,source:'Source prose.',result:'Edited prose.'})).json();
    assert.equal(result.source.metrics.ai,0.7); assert.equal(result.result.metrics.mixed,0.2); assert.equal(calls.length,2);
    assert.equal(calls[0].options.headers['x-api-key'],'test-only-detector-key');
    assert.deepEqual(JSON.parse(calls[0].options.body),{document:'Source prose.'});
    assert.equal((await fetch(base+'/api/detectors/check',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,403);
  } finally {app.closeAllConnections();await new Promise(r=>app.close(r));await rm(dir,{recursive:true,force:true});}
});
