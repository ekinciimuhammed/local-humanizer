// Explicit live public-UI evaluation, never part of the product or npm test.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'/tools/node_modules/playwright-core/index.mjs');
const dir='docs/evaluations/2026-09-21-expansion';
const id=process.argv[2];
const suffix=process.argv[3]==='repeat'?'-repeat':'';
if(!/^(?:final-(?:garden|bus)-(?:source|output)|lexapp-(?:overview|library|survey)|brief-(?:overview|library|survey)|strong-(?:overview|library|survey)|app-(?:overview|library|survey)|deepseek-(?:overview|library|survey)|reconstruct|everyday|reorder|hip(?:[5-9]|10)|authormist|source|editor-control|editor-faithful|demo-qwen|demo-qwen38|demo-gemma|claims-qwen|claims-gemma|lexical-qwen|lexical-gemma|lexical-repaired|lexical-guided-repair|targeted|reasoning-repair|general-source|general-library|general-survey|cross-demo-qwen|cross-demo-gemma|cross-claims-gemma|library-(?:source|output)|survey-(?:source|output))$/.test(id))throw Error('Unknown explicit research case');
const row=JSON.parse(await readFile(dir+'/'+id+'.json','utf8'));
const text=row.output;
if(typeof text!=='string'||!text.trim())throw Error('No complete output to scan');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/ms-playwright/chromium-1234/chrome-linux/chrome',headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1100}});
 await page.goto('https://www.zerogpt.com/',{waitUntil:'domcontentloaded',timeout:30000});
 await page.locator('#textArea').fill(text);
 await page.getByRole('button',{name:'Detect Text',exact:true}).click();
 let status='result';
 try{await page.getByText(/Your Text|Your text|Your Content|Your content/).first().waitFor({state:'visible',timeout:45000});}catch{status='no-result';}
 const visibleText=await page.locator('body').innerText();
 const match=visibleText.match(/Your Text[^\n]*\n+([\d.]+)%/i);
 const percent=match?Number(match[1]):null;
 if(percent===null)status='no-score';
 await page.screenshot({path:dir+'/zerogpt-'+id+suffix+'.png',fullPage:true});
 await writeFile(dir+'/zerogpt-'+id+suffix+'.json',JSON.stringify({checkedAt:new Date().toISOString(),site:'https://www.zerogpt.com/',id,status,percent,submittedText:text,textHash:createHash('sha256').update(text).digest('hex'),visibleText},null,2)+'\n');
 console.log(JSON.stringify({id,status,percent,visibleResult:visibleText.match(/Your Text[^]*?AI GPT\*/i)?.[0]?.slice(0,400)}));
}finally{await browser.close();}
