// Offline acceptance: optional HIP worker and checker provider are local fixtures.
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createApp } from '../src/server.mjs';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const dir=await mkdtemp(join(tmpdir(),'humanizer-engines-ui-'));
let rewriteCalls=0,checkerCalls=0,slow=false;
const worker=http.createServer(async(req,res)=>{
  let raw='';for await(const part of req)raw+=part;
  res.setHeader('Content-Type','application/json');
  if(req.url==='/health')return res.end(JSON.stringify({status:'ready',device:'fixture'}));
  rewriteCalls++;res.end(JSON.stringify({text:JSON.parse(raw).text}));
});
await new Promise(r=>worker.listen(0,'127.0.0.1',r));
const app=await createApp({dataDir:dir,hipUrl:`http://127.0.0.1:${worker.address().port}`,detectorFetchImpl:async(_url,options)=>{
  checkerCalls++;
  if(slow)await new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true}));
  return new Response(JSON.stringify({documents:[{class_probabilities:{ai:0.6,mixed:0.3,human:0.1},document_classification:'AI_ONLY'}]}));
}});
await new Promise(r=>app.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1050}});const errors=[],external=[];
 const origin=`http://127.0.0.1:${app.address().port}`;
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!r.url().startsWith(origin))external.push(r.url());});
 await page.goto(origin);await page.locator('#use-hip').click();
 await page.getByText('Worker ready · fixture',{exact:true}).waitFor();
 assert.equal(await page.locator('#model-select').isDisabled(),true);
 const tooLong='A clear explanation. '.repeat(320);
 await page.locator('#original').fill(tooLong);assert.equal(await page.locator('#original').inputValue(),tooLong);
 await page.locator('#humanize-button').click();await page.getByText(/HIP supports up to 6,000/).waitFor();
 assert.equal(await page.locator('#original').inputValue(),tooLong);assert.equal(rewriteCalls,0);
 await page.locator('#original').fill('The study found 50 participants. The findings remain uncertain.');
 await page.locator('#hip-rounds').selectOption('2');await page.locator('#humanize-button').click();
 await page.getByText('Local checks passed',{exact:true}).waitFor();assert.equal(rewriteCalls,2);assert.equal(checkerCalls,0);
 assert.equal(await page.locator('#copy-output').isDisabled(),false);
 await page.locator('#open-settings').click();
 await page.getByLabel('Enable external checking',{exact:true}).check();
 await page.getByLabel('Check automatically after a successful rewrite',{exact:true}).check();
 await page.getByLabel('Also send and check the original text',{exact:true}).check();
 await page.getByLabel('GPTZero API key',{exact:true}).fill('test-only-browser-key');
 await page.getByRole('button',{name:'Save checker settings',exact:true}).click();
 await page.getByText('Checker settings saved.',{exact:true}).waitFor();
 assert.equal(await page.getByLabel('GPTZero API key',{exact:true}).inputValue(),'');
 await page.locator('#checker-settings').scrollIntoViewIfNeeded();
 await page.screenshot({path:'docs/screenshots/checker-settings.png',fullPage:true});
 await page.locator('#close-settings').click();
 await page.locator('#humanize-button').click();
 await page.getByText('Check complete. Scores refer to the text versions shown below.',{exact:true}).waitFor({state:'attached'});
 if(!await page.locator('#checker-results').locator('..').evaluate(element=>element.open)) await page.locator('#checker-results').locator('..').locator('summary').click();
 assert.equal(await page.getByText('AI-only class probability: 60.0%',{exact:true}).count(),2);
 assert.equal(checkerCalls,1); // Identical source/output shares the same cached scan.
 await page.screenshot({path:'docs/screenshots/hip-checkers.png',fullPage:true});
 await page.locator('#original').fill('A different source for cancellation.');
 assert.equal(await page.locator('.checker-card').count(),0);
 slow=true;await page.locator('#humanize-button').click();
 await page.getByText('Checking with the external service…',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Cancel check',exact:true}).click();
 await page.getByText('Checker request cancelled. No score is available.',{exact:true}).waitFor();
 assert.equal(await page.locator('#output').inputValue(),'A different source for cancellation.');
 assert.equal(await page.locator('.checker-card').count(),0);
 await page.reload();await page.locator('#original').waitFor();
 assert.equal(await page.locator('#engine-select').inputValue(),'hip');assert.equal(await page.locator('#hip-rounds').inputValue(),'2');
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.screenshot({path:'docs/screenshots/hip-mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 console.log('HIP/checker browser acceptance passed: no-key onboarding, two passes, no source truncation, saved credentials redacted, automatic scores, stale invalidation, cancel, persistence, mobile, no external requests.');
}finally{
 await browser.close();app.closeAllConnections();worker.closeAllConnections();
 await Promise.all([new Promise(r=>app.close(r)),new Promise(r=>worker.close(r))]);await rm(dir,{recursive:true,force:true});
}
