import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {DetectorStore,DetectorService} from '../src/detectors.mjs';
import {mountDetectors} from '../public/detectors.js';
const hash=text=>createHash('sha256').update(text).digest('hex');
async function fixture(t){const dir=await mkdtemp(join(tmpdir(),'multi-checker-'));t.after(()=>rm(dir,{recursive:true,force:true}));const store=new DetectorStore(dir);await store.init();return store;}
test('selected additional checkers persist and requests cannot silently add a recipient',async t=>{
 const store=await fixture(t);await store.update({enabled:true,provider:'zerogpt-web',additionalProviders:['sapling-web'],compareSource:true});
 assert.deepEqual(store.public().additionalProviders,['sapling-web']);
 const restored=new DetectorStore(store.directory);await restored.init();assert.deepEqual(restored.public().additionalProviders,['sapling-web']);
 const sent=[];const service=new DetectorService(store,{fetchImpl:async(url,options)=>{const body=JSON.parse(options.body);sent.push(body);return Response.json({percentage:body.provider==='sapling-web'?76:12,textHash:hash(body.text),checkedAt:new Date().toISOString()});}});
 const request={source:'Source.',result:'Rewrite.',settingsRevision:store.public().revision,automatic:false};
 const first=await service.check({...request,provider:'zerogpt-web'});const second=await service.check({...request,provider:'sapling-web'});
 assert.equal(first.result.metrics.visiblePercentage,12);assert.equal(second.result.metrics.visiblePercentage,76);assert.equal(sent.length,4,'each service needs its own cache');
 assert.equal(sent[2].provider,'sapling-web');
 await assert.rejects(service.check({...request,provider:'zerogpt'}),e=>e.status===409);assert.equal(sent.length,4);
 await store.update({additionalProviders:[]});await assert.rejects(service.check({...request,provider:'sapling-web'}),e=>e.status===409);
});
test('checker selections reject unknown, duplicate and oversized lists',async t=>{
 const store=await fixture(t);for(const additionalProviders of ['sapling-web',['unknown'],['sapling-web','sapling-web'],Array(20).fill('zerogpt-web')])await assert.rejects(store.update({additionalProviders}),e=>e.status===400);
});
class Node{constructor(tag){this.tag=tag;this.children=[];this.listeners={};this.attributes={};this.value='';}append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=nodes;}setAttribute(k,v){this.attributes[k]=v;}addEventListener(k,v){this.listeners[k]=v;}}
const text=n=>[n.textContent||'',...n.children.map(text)].join(' ');
const scan=(percentage)=>({metrics:{visiblePercentage:percentage},textHash:'a'.repeat(64),checkedAt:'2026-09-21T14:00:00Z'});
test('multiple checker rows retain successes, show before → after and isolate a failed provider',async()=>{
 const previous=globalThis.document;globalThis.document={createElement:t=>new Node(t)};
 try{const root=new Node('section'),sent=[];const texts={source:'Source.',result:'Rewrite.'};
 const ui=mountDetectors({settingsRoot:new Node('section'),resultRoot:root,getTexts:()=>texts,api:async(_path,body)=>{sent.push(body);if(body.provider==='sapling-web')throw Error('Website challenge. No score is available.');return{provider:body.provider,source:scan(100),result:scan(12.5)};}});
 ui.updateSettings({enabled:true,autoCheck:false,compareSource:true,provider:'zerogpt-web',additionalProviders:['sapling-web'],revision:'version'});
 await ui.check(texts.source,texts.result);
 assert.deepEqual(sent.map(x=>x.provider),['zerogpt-web','sapling-web']);assert.match(text(root),/100\.0%.*→.*12\.5%/);assert.match(text(root),/87\.5.*percentage points lower/);assert.match(text(root),/challenge/);
 ui.invalidate();assert.doesNotMatch(text(root),/12\.5%/);
 }finally{globalThis.document=previous;}
});
test('cancelling a multi-checker run prevents the next external recipient',async()=>{
 const previous=globalThis.document;globalThis.document={createElement:t=>new Node(t)};
 try{const root=new Node('section'),sent=[];let release;const texts={source:'Source.',result:'Rewrite.'};
 const ui=mountDetectors({settingsRoot:new Node('section'),resultRoot:root,getTexts:()=>texts,api:async(_path,body)=>{sent.push(body);return new Promise(r=>{release=r;});}});
 ui.updateSettings({enabled:true,autoCheck:false,compareSource:true,provider:'zerogpt-web',additionalProviders:['sapling-web'],revision:'version'});
 const pending=ui.check(texts.source,texts.result);ui.invalidate();release({provider:'zerogpt-web',source:scan(100),result:scan(0)});await pending;assert.equal(sent.length,1);assert.doesNotMatch(text(root),/0\.0%/);
 }finally{globalThis.document=previous;}
});
