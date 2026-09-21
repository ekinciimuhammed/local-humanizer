// Three deterministic structural controls. No lexical or punctuation changes.
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const dir='docs/evaluations/2026-09-21-roundtrip';
const previous='docs/evaluations/2026-09-21-expansion';
const source=JSON.parse(await readFile(previous+'/corpus.json','utf8'))[0].text;
for(const [id,parent,order] of [
 ['order-source',null,[1,0,2,3]],
 ['order-app','lexapp-overview',[1,0,2,3]],
 ['order-repair','lexical-guided-repair',[2,0,1]],
]){
 const input=parent?JSON.parse(await readFile(previous+'/'+parent+'.json','utf8')).output:source;
 const paragraphs=input.split('\n\n');assert.equal(paragraphs.length,order.length);
 assert.deepEqual([...order].sort(),paragraphs.map((_,i)=>i));
 const output=order.map(i=>paragraphs[i]).join('\n\n');
 assert.deepEqual(output.split('\n\n').sort(),[...paragraphs].sort());
 await writeFile(dir+'/'+id+'.json',JSON.stringify({id,source,parent,input,order,output,method:'whole-paragraph-permutation',complete:true,error:null,lexicalEdits:0,punctuationEdits:0},null,2)+'\n');
 console.log(id+': all complete paragraphs preserved exactly');
}
