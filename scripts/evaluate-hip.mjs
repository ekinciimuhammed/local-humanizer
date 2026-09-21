// Explicit research command. Only the existing synthetic/public evaluation corpus.
// Native HIP only; this script does not send text to an external detector.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { HipClient, hipInput } from '../src/hip.mjs';
import { validateFacts } from '../src/preservation.mjs';
const cases = JSON.parse(await readFile('docs/evaluations/2026-09-21-natural-v2/corpus.json','utf8'));
const caseId = process.argv[2] || 'screenshot';
const rounds = Number(process.argv[3] || '1');
if(!['screenshot','research','control','email'].includes(caseId)||![1,2].includes(rounds))throw new Error('Use a listed synthetic case and one or two passes.');
const sample=cases.find(c=>c.id===caseId);hipInput(sample.text);
const client=new HipClient();const status=await client.status();if(!status.ready)throw new Error(status.message);
const directory='docs/evaluations/2026-09-21-hip';await mkdir(directory,{recursive:true});
let input=sample.text;const records=[];
for(let round=1;round<=rounds;round++){
 hipInput(input);const started=Date.now();
 const response=await client.request('/rewrite',{text:input,id:randomUUID(),seed:41+round,timeoutSeconds:180},AbortSignal.timeout(185000));
 const issues=validateFacts(sample.text,response.text);
 records.push({round,source:sample.text,input,output:response.text,seconds:(Date.now()-started)/1000,preservationIssues:issues,worker:response,semanticReview:'pending'});
 await writeFile(`${directory}/${caseId}-${rounds}-pass.json`,JSON.stringify({case:caseId,checkedAt:new Date().toISOString(),records},null,2)+'\n');
 console.log(JSON.stringify({round,seconds:records.at(-1).seconds,preservationIssues:issues,output:response.text}));
 if(issues.length)break;
 input=response.text;
}
