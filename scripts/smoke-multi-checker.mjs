// Explicit live application API verification on an already-public saved example.
import{readFile,writeFile,mkdtemp,rm}from'node:fs/promises';import{tmpdir}from'node:os';import{join}from'node:path';import{createApp}from'../src/server.mjs';
const sample=JSON.parse(await readFile('docs/evaluations/2026-09-21-roundtrip/live-profile.json','utf8'));
const data=await mkdtemp(join(tmpdir(),'multi-checker-smoke-')),app=await createApp({dataDir:data});
try{
 await new Promise(r=>app.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.address().port,headers={'Content-Type':'application/json','X-Humanizer-Request':'1'};
 const r=await fetch(base+'/api/detectors/settings',{method:'PATCH',headers,body:JSON.stringify({provider:'zerogpt-web',additionalProviders:['sapling-web'],enabled:true,compareSource:true,autoCheck:false})});if(!r.ok)throw Error('Settings HTTP '+r.status);const settings=await r.json();
 const record={inputSource:sample.source,inputResult:sample.output,productionSettingsTouched:false,services:[]};
 for(const provider of ['zerogpt-web','sapling-web']){
  const response=await fetch(base+'/api/detectors/check',{method:'POST',headers,body:JSON.stringify({provider,settingsRevision:settings.revision,automatic:false,source:sample.source,result:sample.output})});
  const result=await response.json();record.services.push({provider,httpStatus:response.status,result});console.log(JSON.stringify(record.services.at(-1)));if(!response.ok)process.exitCode=1;
 }
 await writeFile('docs/evaluations/2026-09-21-multi-checker/application-comparison.json',JSON.stringify(record,null,2)+'\n',{flag:'wx'});
}finally{app.closeAllConnections();await new Promise(r=>app.close(r));await rm(data,{recursive:true,force:true});}
