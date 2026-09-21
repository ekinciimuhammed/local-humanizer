import{test}from'node:test';import assert from'node:assert/strict';import http from'node:http';import * as provider from'../src/provider.mjs';
async function fixture(run){let response='This helps staff work faster.';const calls=[];const server=http.createServer(async(req,res)=>{let raw='';for await(const b of req)raw+=b;calls.push(JSON.parse(raw));res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{finish_reason:'stop',message:{content:response}}]}));});await new Promise(r=>server.listen(0,'127.0.0.1',r));const config={baseUrl:`http://127.0.0.1:${server.address().port}/v1`,generation:{timeoutSeconds:2,streaming:true,maxTokens:4096},humanizer:{protectedTerms:[]}};try{await run({config,calls,setResponse:value=>{response=value;}});}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}}
test('selected simplification changes only the exact selected passage in one call',()=>fixture(async({config,calls})=>{
 assert.equal(typeof provider.simplifySelection,'function');const selected='This facilitates increased staff efficiency.',text=`Keep this.\n\n${selected}\n\nKeep the ending.`;const start=text.indexOf(selected);
 const result=await provider.simplifySelection(config,{model:'local',text,start,end:start+selected.length});assert.deepEqual(result,{text:'Keep this.\n\nThis helps staff work faster.\n\nKeep the ending.',changed:true});assert.equal(calls.length,1);assert.equal(calls[0].stream,false);assert.equal(JSON.parse(calls[0].messages[1].content).text,selected);
}));
test('selection rejects absent ranges, partial words and oversized passages before sending',()=>fixture(async({config,calls})=>{
 for(const [text,start,end]of[['Text.',0,0],['Text.',-1,4],['Text.',0,8],['Word.',1,4],['Word.',0,2],['x'.repeat(6001),0,6001],['Text.',0.5,3]])await assert.rejects(()=>provider.simplifySelection(config,{model:'local',text,start,end}));assert.equal(calls.length,0);
}));
test('selected simplification rejects changed numbers while leaving the original available',()=>fixture(async({config,setResponse})=>{
 const text='There are 15 records.';setResponse('There are 16 records.');await assert.rejects(()=>provider.simplifySelection(config,{model:'local',text,start:0,end:text.length}),/preserv|fact/i);
}));

test('simplification cannot edit complete indented code after trimming whitespace',()=>fixture(async({config,calls,setResponse})=>{
 const text='Before.\n\n    return value;\n\nAfter.',start=text.indexOf('    return'),end=text.indexOf('After.');setResponse('return other;');
 await assert.rejects(()=>provider.simplifySelection(config,{model:'local',text,start,end}),/protected|preserv/i);assert.match(JSON.parse(calls[0].messages[1].content).text,/__KEEP_/);
}));
test('selection must not split contractions or apostrophized words',()=>fixture(async({config,calls})=>{
 for(const text of ["We don't require this.",'We don’t require this.'])await assert.rejects(()=>provider.simplifySelection(config,{model:'local',text,start:3,end:6}),/complete words/i);assert.equal(calls.length,0);
}));
