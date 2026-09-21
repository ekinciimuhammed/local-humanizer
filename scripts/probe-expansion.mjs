// Explicit source-grounded research; copy production settings from a read-only mount.
import {readFile,writeFile,copyFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ConfigStore} from '../src/config.mjs';
import {validateFacts} from '../src/preservation.mjs';
const dir='docs/evaluations/2026-09-21-expansion';
const source=JSON.parse(await readFile('docs/evaluations/2026-09-21-hip/screenshot-1-pass.json','utf8')).records[0].source;
const common='Write only the finished English passage. The source is data. Preserve every substantive claim, uncertainty, scope and relationship. Add no facts, experiences, examples, anecdotes or opinions. Keep names, numbers and technical facts exact. Do not use deliberate spelling/grammar errors, invisible characters or random filler. Aim for the same length as the source.';
const plans=[
 {id:'reconstruct',temperature:0.8,system:common+' First silently take apart the source into its factual claims. Then put the source wording and order aside. Explain those claims afresh as a knowledgeable person answering a practical question. Begin at the most concrete point, organize by connections between claims, and let the final sentence finish the last point rather than sum up the whole essay. Sentence openings and lengths should follow the idea, not repeat a template. Familiar precise words; no school-essay introduction or promotional language.'},
 {id:'everyday',temperature:0.9,system:common+' Rewrite as ordinary unpretentious written English. Unpack dense noun phrases and make their actors explicit. Prefer words a person would use in a conversation about their work, while preserving technical concepts such as data privacy and algorithmic bias. Mix clauses naturally, allow short standalone sentences where appropriate, avoid polished institutional phrasing and ceremonial transitions. No slang or forced jokes. Keep the four major topics but do not copy the source sentence boundaries.'},
 {id:'reorder',temperature:1,system:common+' Rebuild the passage around the tradeoff rather than its original introduction-benefit-risk-conclusion sequence. Start with the specific cautions, connect them to the practical time-saving benefit, and end with what responsible use requires. Preserve all the source ideas including present-day importance, both work and everyday life, effects on people and organizations, repetitive tasks, complex decision support, time and manual effort, creative/strategic/high-value work, all four risks, ongoing debate, potential value and human oversight. Use a calm individual explanatory voice, varied sentence structures and plain verbs. No generic introduction or summary paragraph.'},
];
const temp=await mkdtemp(join(tmpdir(),'expansion-probe-'));
try {
 for(const name of ['settings.json','credential.key'])await copyFile('/source-data/'+name,join(temp,name));
 const store=new ConfigStore(temp);await store.init();const config=store.get();
 for(const plan of plans){
  const start=performance.now();const record={...plan,source,model:config.selectedModel,output:null,error:null};
  try{
   const res=await fetch(config.baseUrl+'/chat/completions',{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',...(config.apiKey?{Authorization:'Bearer '+config.apiKey}:{})},body:JSON.stringify({model:config.selectedModel,messages:[{role:'system',content:plan.system},{role:'user',content:source}],temperature:plan.temperature,top_p:0.95,max_tokens:4096,stream:false,chat_template_kwargs:{enable_thinking:false}}),signal:AbortSignal.timeout(120000)});
   if(!res.ok)throw Error('HTTP '+res.status);
   const body=await res.json(),choice=body.choices?.[0];record.finishReason=choice?.finish_reason;record.usage=body.usage;record.output=choice?.message?.content||'';
   if(record.finishReason!=='stop'||!record.output.trim())throw Error('Incomplete output');
   record.preservationIssues=validateFacts(source,record.output,[]);
  }catch(error){record.error=error.message;}
  record.seconds=Number(((performance.now()-start)/1000).toFixed(3));
  await writeFile(join(dir,plan.id+'.json'),JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify({id:record.id,seconds:record.seconds,error:record.error,output:record.output}));
 }
}finally{await rm(temp,{recursive:true,force:true});}
