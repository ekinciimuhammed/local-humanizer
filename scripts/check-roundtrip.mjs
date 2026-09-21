// Explicit research submissions through the already-running local website helper.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const dir='docs/evaluations/2026-09-21-roundtrip';
const ids=process.argv.slice(2);
if(!ids.length||ids.some(id=>!['turkish','french','japanese','order-source','order-app','order-repair','codex-writing','codex-astra','codex-lexical','codex-example','live-profile'].includes(id)))throw Error('Select explicit research cases.');
for(const id of ids){
 const row=JSON.parse(await readFile(dir+'/'+id+'.json','utf8'));
 if(row.error||!row.output?.trim()||!(row.returnTranslation?.finishReason==='stop'||(row.method==='whole-paragraph-permutation'||row.method==='application'||row.provider==='Codex CLI existing ChatGPT login')&&row.complete===true))throw Error('Cannot scan incomplete '+id);
 const text=row.output,textHash=createHash('sha256').update(text).digest('hex');
 const record={id,site:'https://www.zerogpt.com/',method:'local-browser-helper-visible-page',submittedText:text,textHash,percent:null,error:null};
 try{
  const response=await fetch('http://host.docker.internal:18083/check',{method:'POST',headers:{'Content-Type':'application/json','X-Humanizer-Browser-Checker':'1'},body:JSON.stringify({text}),signal:AbortSignal.timeout(65000)});
  const body=await response.json();
  if(!response.ok)throw Error(body.message||'HTTP '+response.status);
  if(body.textHash!==textHash||!Number.isFinite(body.percentage)||body.percentage<0||body.percentage>100||!Number.isFinite(Date.parse(body.checkedAt)))throw Error('Invalid helper attribution');
  record.percent=body.percentage;record.checkedAt=body.checkedAt;
 }catch(error){record.error=error.message;}
 await writeFile(dir+'/zerogpt-'+id+'.json',JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify({id,percent:record.percent,error:record.error}));
}
