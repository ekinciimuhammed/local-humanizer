import { createHash } from 'node:crypto';

export const MAX_CHARS = 15_000;
export const CHECK_TIMEOUT_MS = 60_000;
export class BrowserCheckError extends Error {
  constructor(message, status = 422, code = 'no_score') { super(message); this.status = status; this.code = code; }
}
export function validateText(text) {
  if (typeof text !== 'string' || !text.trim() || text.length > MAX_CHARS) throw new BrowserCheckError('Public website checking accepts 1–15,000 characters. Text is never truncated.', 400, 'invalid_text');
}
function checkChallenge(text) {
  if (/verify (?:that )?you are human|complete (?:the |a )?captcha|solve (?:the |a )?captcha|checking your browser|unusual traffic|access denied|too many requests|rate limit exceeded|daily limit reached|please try again later/i.test(text)) throw new BrowserCheckError('The website displayed a challenge or usage limit. No bypass or retry was attempted.', 422, 'challenge');
}
export function parseVisibleResult(text) {
  checkChallenge(text);
  // Anchor the number to the visible result heading and its AI GPT label,
  // never to advertising percentages elsewhere on the page.
  const matches = [...text.matchAll(/^Your (?:Text|Content)[^\n]*\n+\s*(\d+(?:\.\d+)?)%\s*\n+\s*AI GPT\*/gim)];
  const percentage = matches.length === 1 ? Number(matches[0][1]) : NaN;
  if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) throw new BrowserCheckError('The website did not display a supported result percentage. No score is available.');
  return percentage;
}

export async function runPublicCheck(text, { signal, browserType, timeoutMs = CHECK_TIMEOUT_MS } = {}) {
  validateText(text);
  const controller = new AbortController();
  const cancel = () => controller.abort(new BrowserCheckError('Website check cancelled.', 499, 'cancelled'));
  if (signal?.aborted) cancel(); else signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(() => controller.abort(new BrowserCheckError('Website check timed out. No score is available.', 504, 'timeout')), Math.max(1, Math.min(CHECK_TIMEOUT_MS, timeoutMs)));
  let browser;
  const close = () => browser?.close().catch(() => {});
  let onAbort;
  const aborted = new Promise((_, reject) => {
    onAbort = () => { void close(); reject(controller.signal.reason); };
    controller.signal.addEventListener('abort', onAbort, { once: true });
  });
  const guard = () => controller.signal.throwIfAborted();
  const work = async () => {
    guard();
    const chromium = browserType || (await import('playwright-core')).chromium;
    guard();
    browser = await chromium.launch({ headless: true });
    if (controller.signal.aborted) { await close(); guard(); }
    // Fresh anonymous context: no account/profile import, traces or screenshots.
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, acceptDownloads: false, serviceWorkers: 'block' });
    guard(); const page = await context.newPage(); page.setDefaultTimeout(15_000);
    await page.goto('https://www.zerogpt.com/', { waitUntil: 'domcontentloaded', timeout: 25_000 });
    guard(); checkChallenge(await page.locator('body').innerText());
    await page.locator('#textArea').fill(text); guard();
    if (await page.locator('#textArea').inputValue() !== text) throw new BrowserCheckError('The website changed or truncated the input. Text was not submitted.', 422, 'input_changed');
    guard();
    const visibleResults = page.getByText(/^Your (?:Text|Content)\b/i).filter({ visible: true });
    if (await visibleResults.count()) throw new BrowserCheckError('The website already displayed a pre-existing result. It cannot be attributed to this text; nothing was submitted.', 422, 'preexisting_result');
    guard();
    await page.getByRole('button', { name: 'Detect Text', exact: true }).click();
    try { await visibleResults.first().waitFor({ state: 'visible', timeout: 45_000 }); }
    catch { guard(); checkChallenge(await page.locator('body').innerText()); throw new BrowserCheckError('The website did not display a result before the deadline. No score is available.'); }
    guard(); const percentage = parseVisibleResult(await page.locator('body').innerText()); guard();
    return { percentage, textHash: createHash('sha256').update(text).digest('hex'), checkedAt: new Date().toISOString() };
  };
  try { guard(); return await Promise.race([work(), aborted]); }
  catch (error) {
    if (controller.signal.aborted) throw controller.signal.reason;
    if (error instanceof BrowserCheckError) throw error;
    throw new BrowserCheckError('The public website could not be checked. Its page may have changed or blocked this request. No score is available.', 502, 'browser_error');
  } finally {
    clearTimeout(timer); signal?.removeEventListener('abort', cancel); controller.signal.removeEventListener('abort', onAbort); await close();
  }
}
