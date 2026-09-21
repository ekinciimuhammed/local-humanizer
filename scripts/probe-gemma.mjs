// Explicit local synthetic evaluation; requires isolated Ollama model on :18082.
import {readFile,writeFile} from 'node:fs/promises';
import {validateFacts} from '../src/preservation.mjs';
const dir='docs/evaluations/2026-09-21-followup';
const id=process.argv[2]||'gemma';
if(!['gemma','library-output','survey-output'].includes(id))throw Error('Unknown fixed case');
const source=id==='gemma'?JSON.parse(await readFile('docs/evaluations/2026-09-21-hip/screenshot-1-pass.json','utf8')).records[0].source:JSON.parse(await readFile(dir+'/heldout.json','utf8')).find(x=>x.id===id.split('-')[0]).text;
const format=JSON.parse(await readFile('data/gemma-probe/prompt_format.json','utf8'));
const start=performance.now();
const res=await fetch('http://127.0.0.1:18082/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'humanizer-gemma-probe',prompt:format.instr+'\n\n'+source.trim()+format.sep,raw:true,stream:false,keep_alive:'10m',options:{temperature:0.85,top_p:0.95,top_k:0,min_p:0,repeat_penalty:1,seed:42,num_ctx:4096,num_predict:900}}),signal:AbortSignal.timeout(300000)});
if(!res.ok)throw Error('Local generation failed HTTP '+res.status+': '+(await res.text()).slice(0,300));
const body=await res.json();
const output=typeof body.response==='string'?body.response.trim():'';
const record={id,source,output,seconds:Number(((performance.now()-start)/1000).toFixed(3)),finishReason:body.done_reason,completed:body.done&&body.done_reason==='stop',model:'jialinyyzz/humanizer-gemma-4-e4b',revision:'93d4eee64b92e8b4ef331540fe1aadac0724dc00',quantization:'Q6_K',runtime:'Ollama 0.33.0 / Metal',promptFormat:'published verbatim, raw completion',options:{temperature:0.85,top_p:0.95,top_k:0,min_p:0,repeat_penalty:1,seed:42,num_ctx:4096,num_predict:900},antiCopyGuard:false,promptTokens:body.prompt_eval_count,outputTokens:body.eval_count,preservationIssues:validateFacts(source,output,[]),semanticReview:'pending'};
await writeFile(dir+'/'+id+'.json',JSON.stringify(record,null,2)+'\n');
console.log(JSON.stringify(record));
