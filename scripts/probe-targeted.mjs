// One real detector-highlight-guided edit; no complete-document rewrite loop.
import {readFile,writeFile,copyFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ConfigStore} from '../src/config.mjs';
import {validateFacts} from '../src/preservation.mjs';
const dir='docs/evaluations/2026-09-21-expansion';
const parent=JSON.parse(await readFile(join(dir,'lexical-guided-repair.json'),'utf8'));
const selected='It saves time and makes tasks faster by handling repeating tasks and helping with hard choices. This lets workers spend more time on creative, strategic, and high-value activities.';
if(parent.output.split(selected).length!==2)throw Error('Selected span changed');
const system='Write a replacement for ONLY the selected passage. Keep every idea and causal relationship, but express them in everyday words and different sentence structures. No formal overview or summary. Make sure the replacement also retains the source point about work that formerly required a lot of time and hands-on effort being completed faster. Repetitive tasks, help with complex decisions, and employees freed for creative, strategic and high-value work must all survive. Express creative/strategic/high-value in plain equivalent phrases rather than this stock list. No new facts or opinions. No deliberate errors. Return only the replacement text, no quotes or explanation. The rest of the draft will remain unchanged.';
const temp=await mkdtemp(join(tmpdir(),'targeted-probe-'));
try{
 for(const name of ['settings.json','credential.key'])await copyFile('/source-data/'+name,join(temp,name));
 const store=new ConfigStore(temp);await store.init();const config=store.get();
 const started=performance.now();const model='gemma-4-31B-it';
 const response=await fetch(config.baseUrl+'/chat/completions',{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',...(config.apiKey?{Authorization:'Bearer '+config.apiKey}:{})},body:JSON.stringify({model,messages:[{role:'system',content:system},{role:'user',content:JSON.stringify({source:parent.source,draft:parent.output,selected})}],temperature:.9,top_p:.95,max_tokens:1024,stream:false}),signal:AbortSignal.timeout(120000)});
 if(!response.ok)throw Error('HTTP '+response.status);const body=await response.json(),choice=body.choices?.[0];
 const replacement=choice?.message?.content?.trim()||'';
 const record={id:'targeted',source:parent.source,draft:parent.output,selected,system,model,temperature:.9,replacement,finishReason:choice?.finish_reason,usage:body.usage,seconds:Number(((performance.now()-started)/1000).toFixed(3)),output:null,error:null};
 if(choice?.finish_reason!=='stop'||!replacement||replacement.length>1000)record.error='Incomplete or oversized replacement';
 else {record.output=parent.output.replace(selected,()=>replacement);record.preservationIssues=validateFacts(parent.source,record.output,[]);}
 await writeFile(join(dir,'targeted.json'),JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify(record));
}finally{await rm(temp,{recursive:true,force:true});}
