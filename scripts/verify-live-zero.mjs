// One fresh visible-page rescan of the exact saved live-app output.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {parseVisibleResult} from '../browser-checker/checker.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'/tools/node_modules/playwright-core/index.mjs');
const dir='docs/evaluations/2026-09-21-roundtrip';
const row=JSON.parse(await readFile(dir+'/live-profile.json','utf8'));
if(!row.complete||row.error||!row.output?.trim())throw Error('No completed live-app output');
const text=row.output;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/ms-playwright/chromium-1234/chrome-linux/chrome',headless:true,args:['--no-sandbox']});
const record={id:'live-profile-repeat',site:'https://www.zerogpt.com/',submittedText:text,textHash:createHash('sha256').update(text).digest('hex'),percent:null,error:null};
try{
 const page=await browser.newPage({viewport:{width:1440,height:1100}});
 await page.goto('https://www.zerogpt.com/',{waitUntil:'domcontentloaded',timeout:30000});
 const headings=page.getByText(/^Your (?:Text|Content)\b/i).filter({visible:true});
 if(await headings.count())throw Error('Pre-existing result; no submission');
 await page.locator('#textArea').fill(text);
 if(await page.locator('#textArea').inputValue()!==text)throw Error('Changed input; no submission');
 await page.getByRole('button',{name:'Detect Text',exact:true}).click();
 await headings.first().waitFor({state:'visible',timeout:45000});
 record.visibleText=await page.locator('body').innerText();
 record.percent=parseVisibleResult(record.visibleText);record.checkedAt=new Date().toISOString();
 await page.screenshot({path:dir+'/zerogpt-live-profile-repeat.png',fullPage:true});
}catch(error){record.error=error.message;}
finally{await browser.close();}
await writeFile(dir+'/zerogpt-live-profile-repeat.json',JSON.stringify(record,null,2)+'\n');
console.log(JSON.stringify({id:record.id,percent:record.percent,error:record.error,textHash:record.textHash}));
