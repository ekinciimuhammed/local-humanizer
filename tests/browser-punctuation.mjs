import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createApp} from '../src/server.mjs';
import {ConfigStore} from '../src/config.mjs';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const dir=await mkdtemp(join(tmpdir(),'punctuation-ui-'));let calls=0,slow=false;
const mock=http.createServer(async(req,res)=>{
 let raw='';for await(const b of req)raw+=b;res.setHeader('Content-Type','application/json');
 if(req.url==='/health')return res.end('{"status":"ready","device":"fixture"}');
 if(req.url==='/rewrite')return res.end(JSON.stringify({text:JSON.parse(raw).text}));
 calls++;if(slow)return;
 res.end(JSON.stringify({choices:[{finish_reason:'stop',message:{content:'[{"before":"decision making","after":"decision-making"}]'}}]}));
});
await new Promise(r=>mock.listen(0,'127.0.0.1',r));const mockUrl=`http://127.0.0.1:${mock.address().port}`;
const store=new ConfigStore(dir);await store.init();await store.update({baseUrl:mockUrl+'/v1',models:[{id:'fixture',enabled:true,available:true}],selectedModel:'fixture',engine:{kind:'hip',hipRounds:1}});
const app=await createApp({dataDir:dir,hipUrl:mockUrl});await new Promise(r=>app.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1100}});const errors=[],external=[];const base=`http://127.0.0.1:${app.address().port}`;
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!r.url().startsWith(base))external.push(r.url());});
 await page.goto(base);await page.locator('#punctuation-model').waitFor({state:'attached',timeout:3000});
 await page.locator('#original').fill('Clear decision making.');await page.locator('#humanize-button').click();await page.getByText('Local checks passed',{exact:true}).waitFor();
 assert.equal(calls,0,'second stage must be explicitly triggered');
 await page.locator('#punctuation-button').click();await page.getByText('Punctuation suggestion ready',{exact:true}).waitFor();
 assert.equal(await page.locator('#output').inputValue(),'Clear decision making.','raw remains selected');
 assert.equal(calls,1);await page.locator('#output-version').selectOption('punctuation');assert.equal(await page.locator('#output').inputValue(),'Clear decision-making.');
 await page.locator('#output-version').selectOption('raw');assert.equal(await page.locator('#output').inputValue(),'Clear decision making.');
 slow=true;await page.locator('#punctuation-button').click();await page.locator('#stop-button').click();await page.getByText(/Punctuation check stopped/).waitFor();
 assert.equal(await page.locator('#output').inputValue(),'Clear decision making.');assert.equal(await page.locator('#copy-output').isDisabled(),false);
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.screenshot({path:'docs/screenshots/punctuation-mobile.png',fullPage:true});
 await page.setViewportSize({width:1440,height:1100});await page.screenshot({path:'docs/screenshots/punctuation-stage.png',fullPage:true});
 await page.locator('#clear-original').click();assert.equal(await page.locator('#punctuation-panel').isVisible(),false);
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);console.log('Punctuation browser passed: explicit second call, raw retained, candidate toggle, cancellation, reset, mobile, zero external requests.');
}finally{await browser.close();app.closeAllConnections();mock.closeAllConnections();await Promise.all([new Promise(r=>app.close(r)),new Promise(r=>mock.close(r))]);await rm(dir,{recursive:true,force:true});}
