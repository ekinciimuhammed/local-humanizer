// Explicit research only: check the exact saved source and rewrite on an
// allowlisted public page. Does not change production consent or settings.
import {readFile,writeFile} from 'node:fs/promises';
import {runPublicCheck} from '../browser-checker/checker.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'/app/node_modules/playwright-core/index.mjs');
const provider=process.argv[2];if(!['zerogpt-web','sapling-web'].includes(provider))throw Error('Choose an explicit web provider');
const row=JSON.parse(await readFile('docs/evaluations/2026-09-21-roundtrip/live-profile.json','utf8'));
const results={provider,source:null,result:null,errors:{}};
for(const [key,text]of [['source',row.source],['result',row.output]]){
 try{results[key]=await runPublicCheck(text,{browserType:chromium,provider});}
 catch(error){results.errors[key]={code:error.code,message:error.message};}
 console.log(JSON.stringify({provider,key,scan:results[key],error:results.errors[key]}));
}
await writeFile(`docs/evaluations/2026-09-21-multi-checker/${provider}.json`,JSON.stringify(results,null,2)+'\n',{flag:'wx'});
