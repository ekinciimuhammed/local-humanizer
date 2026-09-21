// Generated demonstrations are writing examples, not human-authorship ground truth.
import {readFile,writeFile,copyFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ConfigStore} from '../src/config.mjs';
import {validateFacts} from '../src/preservation.mjs';
const dir='docs/evaluations/2026-09-21-expansion';
const source=JSON.parse(await readFile('docs/evaluations/2026-09-21-hip/screenshot-1-pass.json','utf8')).records[0].source;
const exampleSource='The adoption of online appointment booking offers several advantages for small service businesses. Customers can arrange appointments outside normal opening hours, while employees may spend less time answering routine scheduling calls. However, the effectiveness of the system depends on keeping availability information up to date. Businesses should also retain a telephone booking option for customers who cannot use the online service. A booking system may reduce administrative work, but it does not eliminate the need for staff to handle cancellations and unusual requests.';
const exampleDraft='The shop is closed, but a customer can still book an appointment. That is one useful thing about putting bookings online. Staff may also get fewer calls from people simply wanting a slot. The catch is the calendar: if nobody keeps it current, the system will not work as well. Some customers cannot book online at all, so the phone option needs to stay. And staff still have cancellations and awkward requests to deal with. Online booking can cut down the admin; it cannot take over all of it.';
const system='You are an editor rebuilding a passage in an ordinary individual voice. The example shows the level of plainness and structural freedom. Apply the approach, never copy its topic or facts. Keep ALL claims and qualifications of the requested source, including scope, uncertainty and causal direction. Do not add experiences, cases, numbers, judgments or evidence. Replace institutional abstractions with their clear everyday meaning where possible. Start with a concrete practical point, not a topic announcement. Use a natural mixture of short and longer sentences and paragraphs. Do not return commentary, headings, a generic conclusion or any metadata. Return only the new passage. Do not deliberately introduce errors.';
const temp=await mkdtemp(join(tmpdir(),'demo-probe-'));
try{
 for(const name of ['settings.json','credential.key'])await copyFile('/source-data/'+name,join(temp,name));
 const store=new ConfigStore(temp);await store.init();const config=store.get();
 for(const [id,model] of [['demo-qwen','Qwen3.5-122B-A10B'],['demo-qwen38','Qwen3.8-27B'],['demo-gemma','gemma-4-31B-it']]){
  const messages=[{role:'system',content:system},{role:'user',content:exampleSource},{role:'assistant',content:exampleDraft},{role:'user',content:source}];
  const record={id,source,model,system,exampleSource,exampleDraft,temperature:0.9,output:null,error:null};const started=performance.now();
  try{
   const response=await fetch(config.baseUrl+'/chat/completions',{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',...(config.apiKey?{Authorization:'Bearer '+config.apiKey}:{})},body:JSON.stringify({model,messages,temperature:0.9,top_p:0.95,max_tokens:4096,stream:false,...(model.startsWith('Qwen3.5')?{chat_template_kwargs:{enable_thinking:false}}:{})}),signal:AbortSignal.timeout(120000)});
   if(!response.ok)throw Error('HTTP '+response.status);const body=await response.json(),choice=body.choices?.[0];record.finishReason=choice?.finish_reason;record.usage=body.usage;record.output=choice?.message?.content||'';
   if(record.finishReason!=='stop'||!record.output.trim())throw Error('Incomplete generation');record.preservationIssues=validateFacts(source,record.output,[]);
  }catch(error){record.error=error.message;}
  record.seconds=Number(((performance.now()-started)/1000).toFixed(3));await writeFile(join(dir,id+'.json'),JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify({id,seconds:record.seconds,error:record.error,output:record.output}));
 }
}finally{await rm(temp,{recursive:true,force:true});}
