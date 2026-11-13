// Plays full Krilliohn runs in Chrome: both endings, retries, the 50-second clock,
// timeouts, pause, reload, ?reset, no outside requests.
// Usage: npm run dev   (in another terminal)   then   node scripts/browser-audit.mjs [baseUrl] [outputDir]
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { CONFIG } from '../public/config.mjs';

const base = (process.argv[2] || 'http://localhost:3051').replace(/\/$/, '');
const output = process.argv[3] || 'output/playwright';
await mkdir(output, { recursive: true });
const origin = new URL(base).origin;
const errors = [], outside = [];
const state = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const phaseIs = (page, ...phases) => page.waitForFunction(list => list.includes(JSON.parse(window.render_game_to_text()).phase), phases);
const advance = (page, ms) => page.evaluate(ms => window.advanceTime(ms), ms);
const noHorizontalScroll = async page => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal scroll');
const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) <= 1, `${label}: ${actual} vs ${expected}`);

async function watch(page, label) {
  page.on('pageerror', e => errors.push(`${label}: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`${label}: ${m.text()}`); });
  page.on('request', r => { if (new URL(r.url()).origin !== origin && !r.url().startsWith('data:')) outside.push(r.url()); });
}
async function start(page) {
  await page.goto(base + '/?reset&test=1');
  await page.waitForFunction(() => window.render_game_to_text && JSON.parse(window.render_game_to_text()).phase === 'intro');
  assert.equal(new URL(page.url()).searchParams.has('reset'), false, '?reset is removed from the address bar');
  await page.evaluate(() => document.fonts.ready);
  await page.locator('#start-btn').click({ force: true });
}
// Skip the 3-second "clock starts in" descent and check the full clock is showing.
async function toAnswering(page, round) {
  await phaseIs(page, 'preview', 'answering');
  assert.equal((await state(page)).round, round);
  await advance(page, 3100);
  await phaseIs(page, 'answering');
  assert.ok(await page.locator('.timer').isVisible(), 'timer is visible');
  near((await state(page)).seconds, 50, 'clock starts at 50');
}
async function rejected(page, text, expected, { cleared = false } = {}) {
  await page.locator('#answer').fill(text);
  await page.locator('#answer').press('Enter');
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).status !== '');
  const s = await state(page);
  assert.equal(s.phase, 'answering', `${text} gives another try`);
  if (expected instanceof RegExp) assert.match(s.status, expected); else assert.equal(s.status, expected);
  assert.equal(s.draft, cleared ? '' : text, cleared ? 'box empties' : 'box keeps the text');
}
async function land(page) {
  await phaseIs(page, 'landed').catch(async e => { console.log('STUCK', JSON.stringify({ ...(await state(page)), results: undefined }), await page.evaluate(() => ({ open: !!document.querySelector('dialog[open]'), focus: document.activeElement?.id }))); throw e; });
  await page.waitForTimeout(120);
  return (await page.locator('#landing').innerText()).replace(/\s+/g, ' ').trim();
}
async function answer(page, text) {
  await page.locator('#answer').fill(text);
  await page.locator('#answer').press('Enter');
  return land(page);
}
async function timeOut(page) {
  await advance(page, 51000);
  return land(page);
}
async function descend(page) { await page.locator('#next-btn').click({ force: true }); }

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await context.newPage();
  await watch(page, 'desktop');
  const log = [];

  // ---------------------------------------------------------------- yes run
  await start(page);
  await phaseIs(page, 'preview');
  assert.match(await page.locator('#preview-label').innerText(), /the clock starts in [1-3]/);
  await page.screenshot({ path: `${output}/preview.png` });
  await toAnswering(page, 0);
  await page.locator('#answer').press('Enter'); // empty submission does nothing
  await page.waitForTimeout(250);
  assert.equal((await state(page)).phase, 'answering');
  await advance(page, 10000);
  near((await state(page)).seconds, 40, 'clock counts down');
  log.push(await answer(page, 'chain chomp')); await descend(page);

  await toAnswering(page, 1);
  await rejected(page, 'Ailee', '“Ailee”: no echo. try again');
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${output}/rejected.png` });
  log.push(await answer(page, 'Jungkook')); await descend(page);

  await toAnswering(page, 2);
  await rejected(page, 'Bowling', '“Bowling”: no echo. try again');
  log.push(await answer(page, '20q')); await descend(page);

  await toAnswering(page, 3);
  await rejected(page, 'determinant', /^“determinant”: We haven't learned that yet · try again$/);
  log.push(await answer(page, 'contrapositive')); await descend(page);

  for (const [round, text] of [[4, 'hyunggyu'], [5, 'mai tai'], [6, 'when nic set off the fire alarm'], [7, 'parking garage']]) {
    await toAnswering(page, round);
    log.push(await answer(page, text)); await descend(page);
  }

  await toAnswering(page, 8);
  const jokes = CONFIG.noReplies;
  await rejected(page, 'no', jokes[0].replaceAll('{answer}', 'no'), { cleared: true });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${output}/final-no.png` });
  await rejected(page, 'nope', jokes[1].replaceAll('{answer}', 'nope'), { cleared: true });
  await rejected(page, 'absolutely not', jokes[2].replaceAll('{answer}', 'absolutely not'), { cleared: true });
  await rejected(page, 'let me think', '“let me think”: no echo. try again');
  log.push(await answer(page, 'yesss ❤️'));
  await page.screenshot({ path: `${output}/final-yes-landing.png` });
  await descend(page);
  await phaseIs(page, 'done');
  await page.waitForTimeout(300);
  const yes = await state(page);
  assert.equal(yes.ending, 'yes');
  assert.equal(yes.targetDepth, 9000, 'depth meter goes to the very bottom');
  assert.deepEqual(yes.results.map(r => r.score), [100, 10, 100, 100, 100, 85, 30, 100, 100]);
  assert.ok(await page.locator('.ending-yes').isVisible());
  assert.ok((await page.locator('#results').innerText()).includes(CONFIG.yesMessage));
  await page.screenshot({ path: `${output}/yes-ending.png` });
  await page.locator('#copy-result').click();
  const shared = await page.evaluate(() => navigator.clipboard.readText());
  assert.ok(shared.startsWith(`${CONFIG.shareTitle} 🦐\n725/900 · 9,000m\n🌟🫧🌟🌟🌟🏮🐟🌟🌟`), shared);
  await page.reload();
  await phaseIs(page, 'done');
  assert.equal((await state(page)).ending, 'yes', 'reload reopens the ending');
  console.log('Yes run:\n  ' + log.join('\n  '));

  // ---------------------------------------------- timeouts, pause, other ending
  log.length = 0;
  await start(page);
  await toAnswering(page, 0);
  await advance(page, 10000);
  await page.locator('#menu-btn').click();
  await advance(page, 20000); // menu open: clock is paused
  assert.equal((await state(page)).paused, true);
  await page.locator('#menu-dialog .close').click();
  near((await state(page)).seconds, 40, 'menu pauses the clock');
  log.push(await answer(page, 'banana')); await descend(page);

  await toAnswering(page, 1);
  log.push(await timeOut(page)); // empty box
  assert.match(log.at(-1), /NOTHING LANDED .*the clock beat you to it/);
  await descend(page);

  await toAnswering(page, 2);
  await page.locator('#answer').fill('chess'); // typed, never submitted
  log.push(await timeOut(page));
  assert.match(log.at(-1), /SCHOOLER “Chess” \+30/);
  await descend(page);

  await toAnswering(page, 3);
  log.push(await answer(page, 'vector')); await descend(page);
  await toAnswering(page, 4);
  log.push(await answer(page, 'sonny')); await descend(page);

  await toAnswering(page, 5);
  await page.locator('#answer').fill('zzzz');
  log.push(await timeOut(page));
  assert.match(log.at(-1), /NOTHING LANDED .*never made it onto the reef/);
  await descend(page);

  await toAnswering(page, 6);
  log.push(await answer(page, 'nic got gated')); await descend(page);

  await toAnswering(page, 7);
  await advance(page, 47500);
  await page.waitForFunction(() => document.body.classList.contains('timer-hot'));
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${output}/last-seconds.png` });
  log.push(await answer(page, 'padel')); await descend(page);

  await toAnswering(page, 8);
  await rejected(page, 'no', jokes[0].replaceAll('{answer}', 'no'), { cleared: true });
  await page.locator('#answer').fill('nooo');
  log.push(await timeOut(page));
  assert.match(log.at(-1), /TIME’S UP/);
  await descend(page);
  await phaseIs(page, 'done');
  await page.waitForTimeout(300);
  const other = await state(page);
  assert.equal(other.ending, 'normal');
  assert.deepEqual(other.results.map(r => r.score), [10, 0, 30, 10, 10, 0, 10, 10, 0]);
  assert.ok(await page.locator('.ending-normal').isVisible());
  assert.ok((await page.locator('#results').innerText()).includes(CONFIG.neutralMessage));
  await page.screenshot({ path: `${output}/normal-ending.png` });
  console.log('Clock run:\n  ' + log.join('\n  '));

  // ----------------------------------------------- reload keeps the clock (real time)
  const fresh = await context.newPage();
  await watch(fresh, 'reload');
  await fresh.goto(base + '/?reset');
  await fresh.waitForFunction(() => window.render_game_to_text);
  await fresh.locator('#start-btn').click({ force: true });
  await phaseIs(fresh, 'answering');
  await fresh.waitForTimeout(2000);
  const before = (await state(fresh)).seconds;
  await fresh.reload();
  await fresh.waitForFunction(() => window.render_game_to_text && JSON.parse(window.render_game_to_text()).phase === 'answering');
  const after = (await state(fresh)).seconds;
  assert.ok(Math.abs(after - before) <= 1 && (await state(fresh)).round === 0, `reload resumes the clock (${before}s → ${after}s)`);

  // ---------------------------------------------------------------- mobile
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const mobile = await phone.newPage();
  await watch(mobile, 'mobile');
  await start(mobile);
  await noHorizontalScroll(mobile);
  await toAnswering(mobile, 0);
  await mobile.waitForTimeout(2300);
  await noHorizontalScroll(mobile);
  await mobile.screenshot({ path: `${output}/mobile-round.png` });

  // Branding: no leftover Krillion text except the license credit.
  assert.equal(await page.title(), 'Krilliohn');
  const visible = await page.evaluate(() => document.body.innerText);
  assert.ok(!/krillion/i.test(visible.replace(/OpenKrillion/g, '')), 'no Krillion in visible text except the credit');

  assert.deepEqual(outside, [], 'no requests leave the site');
  assert.deepEqual(errors, [], 'no page errors');
  console.log(`\nBrowser audit passed. Screenshots in ${output}/`);
} finally {
  await browser.close();
}
