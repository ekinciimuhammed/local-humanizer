// Two-stage research: remove the source wording before composing from its claims.
import {readFile,writeFile,copyFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ConfigStore} from '../src/config.mjs';
import {validateFacts} from '../src/preservation.mjs';
const dir='docs/evaluations/2026-09-21-expansion';
const source=JSON.parse(await readFile('docs/evaluations/2026-09-21-hip/screenshot-1-pass.json','utf8')).records[0].source;
const temp=await mkdtemp(join(tmpdir(),'claim-map-'));
try{
 for(const name of ['settings.json','credential.key'])await copyFile('/source-data/'+name,join(temp,name));
 const store=new ConfigStore(temp);await store.init();const config=store.get();
 async function generate(id,model,messages,temperature){
  const record={id,model,messages,temperature,source,output:null,error:null};const started=performance.now();
  try{
   const response=await fetch(config.baseUrl+'/chat/completions',{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',...(config.apiKey?{Authorization:'Bearer '+config.apiKey}:{})},body:JSON.stringify({model,messages,temperature,top_p:.95,max_tokens:4096,stream:false,...(model.startsWith('Qwen3.5')?{chat_template_kwargs:{enable_thinking:false}}:{})}),signal:AbortSignal.timeout(120000)});
   if(!response.ok)throw Error('HTTP '+response.status);const body=await response.json(),choice=body.choices?.[0];record.finishReason=choice?.finish_reason;record.usage=body.usage;record.output=choice?.message?.content||'';
   if(record.finishReason!=='stop'||!record.output.trim())throw Error('Incomplete output');record.preservationIssues=validateFacts(source,record.output,[]);
  }catch(error){record.error=error.message;}
  record.seconds=Number(((performance.now()-started)/1000).toFixed(3));await writeFile(join(dir,id+'.json'),JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify({id,seconds:record.seconds,error:record.error,output:record.output}));return record;
 }
 const map=await generate('claims','Qwen3.5-122B-A10B',[{role:'system',content:'Extract ALL the factual assertions, advice, uncertainties and causal relationships from the source into a JSON array of short notes. Every item must be a telegraphic note, not a sentence copied from the source. Include every scope restriction, actor, number, entity and qualifier. No stylistic observations or invented inferences. Output JSON only.'},{role:'user',content:source}],0);
 if(map.error)throw Error('Claim extraction failed');
 let notes=JSON.parse(map.output.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g,''));
 if(!Array.isArray(notes)||notes.length<5||notes.length>40)throw Error('Unexpected claim map');
 // Reverse the notes so the writer cannot reuse source order by accident.
 notes=notes.reverse();
 const instructions='Use all the notes to write a short piece of ordinary English, around 180–230 words. The notes are the entire factual brief: preserve each point and its qualifiers, add no new facts. These notes are deliberately out of order; arrange them into a coherent explanation. Write as someone thinking a practical issue through, not as a textbook giving an overview. Start with a specific useful point, vary sentence and paragraph length, and use common words instead of abstract noun-heavy phrases. A few short questions may introduce uncertainties already in the notes. Avoid a topic-announcement opening, labeled advantages/disadvantages, stock transitions and a summary ending. Keep the prose grammatical. Return only the piece.';
 for(const [id,model]of [['claims-qwen','Qwen3.5-122B-A10B'],['claims-gemma','gemma-4-31B-it']])await generate(id,model,[{role:'system',content:instructions},{role:'user',content:JSON.stringify({notes})}],.9);
}finally{await rm(temp,{recursive:true,force:true});}
