// Explicit manual research command only; never called by the application.
// Submits this evaluation's public/synthetic text to ZeroGPT's visible web UI.
import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from '/tools/node_modules/playwright-core/index.mjs';
const dir = 'docs/evaluations/2026-09-21-natural-v2';
const which = process.argv[2] || 'source';
const corpus = JSON.parse(await readFile(`${dir}/corpus.json`, 'utf8'));
let sample;
if (which === 'competitor-basic') sample = await readFile(`${dir}/competitor-output.txt`, 'utf8');
else if (which === 'source' || which === 'control') sample = corpus.find(c => c.id === (which === 'source' ? 'screenshot' : 'control')).text;
else {
  const rows = [];
  for (const file of ['candidates', 'strong-candidates', 'final-candidates', 'plain-candidates']) {
    try { rows.push(...JSON.parse(await readFile(`${dir}/${file}.json`, 'utf8')).records); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const row = rows.find(r => r.case === 'screenshot' && r.trial === which && r.accepted);
  if (!row) throw new Error('No accepted synthetic candidate for this trial.');
  sample = row.output;
}
const browser = await chromium.launch({ executablePath: '/ms-playwright/chromium-1234/chrome-linux/chrome', headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  await page.goto('https://www.zerogpt.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.locator('#textArea').fill(sample);
  await page.getByRole('button', { name: 'Detect Text', exact: true }).click();
  let status = 'result';
  try { await page.getByText(/Your Text|Your text|Your Content|Your content/).first().waitFor({ state: 'visible', timeout: 45000 }); }
  catch { status = 'no-result'; }
  const visibleText = await page.locator('body').innerText();
  await page.screenshot({ path: `${dir}/zerogpt-${which}.png`, fullPage: true });
  const record = { checkedAt: new Date().toISOString(), site: 'https://www.zerogpt.com/', which, submittedText: sample, status, visibleText };
  await writeFile(`${dir}/zerogpt-${which}.json`, JSON.stringify(record, null, 2) + '\n');
  console.log(JSON.stringify({ which, status, visibleText: visibleText.slice(0, 5000) }));
} finally { await browser.close(); }
