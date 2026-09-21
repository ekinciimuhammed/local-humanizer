// Frozen four-topic comparison, one call per recipe per source; no score feedback.
import {readFile,writeFile,copyFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import{join}from'node:path';
import{ConfigStore}from'../src/config.mjs';import{buildMessages,PLAIN_REWRITE_INSTRUCTIONS}from'../src/prompt.mjs';
import{protectText,validateFacts}from'../src/preservation.mjs';
const dir='docs/evaluations/2026-09-21-generalization';
const corpus=JSON.parse(await readFile(dir+'/corpus.json','utf8')),candidate=(await readFile(dir+'/candidate.txt','utf8')).trim();
const tmp=await mkdtemp(join(tmpdir(),'generalization-'));
try{
 for(const name of ['settings.json','credential.key'])await copyFile('/source-data/'+name,join(tmp,name));
 const store=new ConfigStore(tmp);await store.init();const config=store.get();
 for(const sample of corpus)for(const recipe of ['existing','general']){
  const protectedText=protectText(sample.text,[]);const messages=buildMessages({text:protectedText.text,strength:'Strong',tone:'Plainspoken',skills:[]});
  if(recipe==='general')messages[0].content=messages[0].content.replace(PLAIN_REWRITE_INSTRUCTIONS,candidate);
  const row={id:sample.id,recipe,source:sample.text,model:config.selectedModel,messages,temperature:.9,topP:.95,output:null,error:null};
  try{
   const r=await fetch(config.baseUrl+'/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',...(config.apiKey?{Authorization:'Bearer '+config.apiKey}:{})},body:JSON.stringify({model:config.selectedModel,messages,temperature:.9,top_p:.95,max_tokens:8192,stream:false}),signal:AbortSignal.timeout(120000)});
   if(!r.ok)throw Error('HTTP '+r.status);const body=await r.json(),choice=body.choices?.[0];if(choice?.finish_reason!=='stop'||!choice.message?.content)throw Error('Incomplete output');
   row.raw=choice.message.content;row.output=protectedText.restore(row.raw);row.usage=body.usage;row.preservationIssues=validateFacts(sample.text,row.output,[]);
  }catch(error){row.error=error.message;}
  await writeFile(`${dir}/${sample.id}-${recipe}.json`,JSON.stringify(row,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({id:sample.id,recipe,error:row.error,output:row.output,preservationIssues:row.preservationIssues}));
 }
}finally{await rm(tmp,{recursive:true,force:true});}
