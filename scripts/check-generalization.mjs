// Fixed corpus measurements. No automatic rewrite loop, retries, or score feedback.
import {readFile,writeFile} from 'node:fs/promises';
import{runPublicCheck}from'../browser-checker/checker.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'/app/node_modules/playwright-core/index.mjs');
const provider=process.argv[2];if(!['zerogpt-web','sapling-web'].includes(provider))throw Error('Select a public checker');
const dir='docs/evaluations/2026-09-21-generalization',corpus=JSON.parse(await readFile(dir+'/corpus.json','utf8'));
for(const item of corpus){
 const row={id:item.id,provider,source:null,existing:null,general:null,errors:{}};
 for(const key of ['source','existing','general']){
  const text=key==='source'?item.text:JSON.parse(await readFile(`${dir}/${item.id}-${key}.json`,'utf8')).output;
  try{row[key]=await runPublicCheck(text,{browserType:chromium,provider});}catch(e){row.errors[key]={code:e.code,message:e.message};}
  console.log(JSON.stringify({id:item.id,provider,key,scan:row[key],error:row.errors[key]}));
 }
 await writeFile(`${dir}/${item.id}-${provider}.json`,JSON.stringify(row,null,2)+'\n',{flag:'wx'});
}
