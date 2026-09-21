// Explicit offline browser contract test. Run inside the helper image with
// --network none; it does not contact ZeroGPT or submit a real document.
import assert from 'node:assert/strict';
import { runPublicCheck } from '../browser-checker/checker.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
let submitted, clicks = 0, preExistingResult = false;
const browserType = {
  async launch(options) {
    const browser = await chromium.launch(options);
    const newContext = browser.newContext.bind(browser);
    browser.newContext = async settings => {
      const context = await newContext(settings);
      await context.exposeBinding('submitFixture', (_source, value) => { submitted = value; clicks++; });
      await context.route('**/*', async route => {
        if (route.request().url() !== 'https://www.zerogpt.com/') return route.abort();
        const result = '<h2>Your Text is Human written</h2><p>0%</p><p>AI GPT*</p>';
        return route.fulfill({ contentType: 'text/html', body: `<!doctype html><textarea id="textArea"></textarea><button id="detect">Detect Text</button><div id="result">${preExistingResult ? result : ''}</div><script>document.getElementById('detect').onclick=async()=>{await window.submitFixture(document.getElementById('textArea').value);${preExistingResult ? '' : `document.getElementById('result').innerHTML=${JSON.stringify(result)};`}};</script>` });
      });
      return context;
    };
    return browser;
  },
};
const result = await runPublicCheck('Offline fixture text.', { browserType });
assert.equal(submitted, 'Offline fixture text.'); assert.equal(clicks, 1); assert.equal(result.percentage, 0);
preExistingResult = true;
await assert.rejects(runPublicCheck('A different newly submitted document.', { browserType }), /pre-existing|existing result/i);
assert.equal(clicks, 1, 'A page showing a pre-existing 0% is rejected before another click.');
console.log('Offline browser contract passed: fresh visible 0% accepted; pre-existing 0% rejected; no external network.');
