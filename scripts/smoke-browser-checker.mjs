// Explicit live smoke using the general AI example and a saved research output.
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../src/server.mjs';
if(process.argv[2] && process.argv[2]!=='--live-profile')throw Error('Unknown research fixture');
const live=process.argv[2]==='--live-profile';
const directory=live?'docs/evaluations/2026-09-21-roundtrip':'docs/evaluations/2026-09-21-expansion';
const sample=JSON.parse(await readFile(join(directory,live?'live-profile.json':'editor-faithful.json'),'utf8'));
if(live&&(!sample.complete||sample.error))throw Error('No completed live-app output');
const data=await mkdtemp(join(tmpdir(),'browser-checker-smoke-'));
const app=await createApp({dataDir:data});
try{
 await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+app.address().port;
 const headers={'Content-Type':'application/json','X-Humanizer-Request':'1'};
 const settings=await(await fetch(base+'/api/detectors/settings',{method:'PATCH',headers,body:JSON.stringify({provider:'zerogpt-web',enabled:true,compareSource:true,autoCheck:false})})).json();
 const response=await fetch(base+'/api/detectors/check',{method:'POST',headers,body:JSON.stringify({provider:'zerogpt-web',settingsRevision:settings.revision,automatic:false,source:sample.source,result:sample.output})});
 const result=await response.json();
 const record={checkedAt:new Date().toISOString(),httpStatus:response.status,inputSource:sample.source,inputResult:sample.output,result,productionSettingsTouched:false};
 await writeFile(join(directory,'browser-checker-app.json'),JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify({status:response.status,result},null,2));
 if(!response.ok)process.exitCode=1;
}finally{app.closeAllConnections();await new Promise(resolve=>app.close(resolve));await rm(data,{recursive:true,force:true});}
