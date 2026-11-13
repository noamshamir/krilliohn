// Plays full Krilliohn runs in Chrome: both endings, resume, reset, no timer, no outside requests.
// Usage: npm run dev   (in another terminal)   then   node scripts/browser-audit.mjs [baseUrl] [outputDir]
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { CONFIG } from '../public/config.mjs';

const base = (process.argv[2] || 'http://localhost:3051').replace(/\/$/, '');
const output = process.argv[3] || 'output/playwright';
await mkdir(output, { recursive: true });
const origin = new URL(base).origin;
const YES_RUN = ['chain chomp', 'Ailee', '20q', 'determinant', 'hyunggyu', 'mai tai', 'when nic set off the fire alarm', 'parking garage', 'yesss ❤️'];
const NO_RUN = ['banana', 'jungkok', 'Bowling', 'vector', 'sonny', 'strawberry wine', 'nic got gated', 'padel', 'maybe'];
const errors = [], outside = [];
const state = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const noTimer = async page => assert.equal(await page.evaluate(() => document.querySelectorAll('.timer, #timer-number, .time-bar, .timer-ring, #preview-label, .danger-glow').length), 0, 'no timer elements');
const noHorizontalScroll = async page => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal scroll');

async function play(page, answers, label) {
  await page.goto(base + '/?reset&test=1');
  await page.waitForFunction(() => window.render_game_to_text && JSON.parse(window.render_game_to_text()).phase === 'intro');
  assert.equal(new URL(page.url()).searchParams.has('reset'), false, '?reset is removed from the address bar');
  await page.evaluate(() => document.fonts.ready);
  await noTimer(page);
  await page.screenshot({ path: `${output}/${label}-home.png` });
  await page.locator('#start-btn').click({ force: true });
  const landings = [];
  for (let i = 0; i < answers.length; i++) {
    await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === 'answering');
    assert.equal((await state(page)).round, i);
    assert.match(await page.locator('#prompt-number').textContent(), new RegExp(`PROMPT ${i + 1} OF 9`));
    await noTimer(page);
    if (i === 0) {
      await page.waitForTimeout(2500); // nothing happens on its own: no countdown, no auto-submit
      assert.equal((await state(page)).phase, 'answering');
      await page.locator('#answer').press('Enter'); // empty submission does nothing
      await page.waitForTimeout(300);
      assert.equal((await state(page)).phase, 'answering');
      assert.equal((await state(page)).results.length, 0);
    }
    await page.locator('#answer').fill(answers[i]);
    if (i === 3 || i === 8) await page.screenshot({ path: `${output}/${label}-round-${i + 1}.png` });
    await page.locator('#answer').press('Enter');
    await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === 'landed');
    await page.waitForTimeout(150);
    const text = (await page.locator('#landing').innerText()).replace(/\s+/g, ' ').trim();
    landings.push(text);
    if (i === 3 || i === 8) await page.screenshot({ path: `${output}/${label}-landing-${i + 1}.png` });
    await page.locator('#next-btn').click({ force: true });
  }
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === 'done');
  await page.waitForTimeout(300);
  return landings;
}

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('request', r => { if (new URL(r.url()).origin !== origin && !r.url().startsWith('data:')) outside.push(r.url()); });

  // Ending 1: yes.
  const yesLandings = await play(page, YES_RUN, 'yes');
  const yes = await state(page);
  assert.equal(yes.ending, 'yes');
  assert.equal(yes.targetDepth, 9000, 'depth meter goes to the very bottom');
  assert.deepEqual(yes.results.map(r => r.score), [100, 30, 100, 0, 100, 85, 30, 100, 100]);
  assert.ok(await page.locator('.ending-yes').isVisible());
  assert.ok((await page.locator('#results').innerText()).includes(CONFIG.yesMessage));
  assert.ok((await page.locator('.result-score').innerText()).includes('9,000m'));
  await page.locator('#copy-result').click();
  const shared = await page.evaluate(() => navigator.clipboard.readText());
  assert.ok(shared.startsWith(CONFIG.shareTitle + ' 🦐\n645/900 · 9,000m\n🌟🐟🌟⬛🌟🏮🐟🌟🌟'), shared);
  await page.locator('#results').evaluate(el => el.scrollTo(0, 0));
  await page.screenshot({ path: `${output}/yes-ending.png` });
  await page.locator('[data-review="5"]').click();
  assert.ok((await page.locator('.review-list').first().innerText()).includes('Maotai'));
  await page.screenshot({ path: `${output}/yes-ending-review.png` });
  await page.locator('#results').evaluate(el => el.scrollTo(0, el.scrollHeight));
  await page.screenshot({ path: `${output}/yes-ending-bottom.png` });

  // Progress is saved: a reload reopens the ending.
  await page.reload();
  await page.waitForFunction(() => window.render_game_to_text && JSON.parse(window.render_game_to_text()).phase === 'done');
  assert.equal((await state(page)).ending, 'yes');

  // Ending 2: anything else (and ?reset starts over).
  const noLandings = await play(page, NO_RUN, 'no');
  const no = await state(page);
  assert.equal(no.ending, 'normal');
  assert.equal(no.results.at(-1).score, 0);
  assert.ok(await page.locator('.ending-normal').isVisible());
  assert.equal(await page.locator('.ending-yes').count(), 0);
  assert.ok((await page.locator('#results').innerText()).includes(CONFIG.neutralMessage));
  await page.locator('#results').evaluate(el => el.scrollTo(0, 0));
  await page.screenshot({ path: `${output}/no-ending.png` });

  // Mid-dive resume.
  await page.goto(base + '/?reset&test=1');
  await page.locator('#start-btn').click({ force: true });
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === 'answering');
  await page.locator('#answer').fill('banana'); await page.locator('#answer').press('Enter');
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === 'landed');
  await page.locator('#next-btn').click({ force: true });
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === 'answering');
  await page.reload();
  await page.waitForFunction(() => window.render_game_to_text && JSON.parse(window.render_game_to_text()).phase === 'answering');
  assert.equal((await state(page)).round, 1);

  // Mobile layout.
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const mobile = await phone.newPage();
  mobile.on('pageerror', e => errors.push('mobile: ' + e.message));
  await mobile.goto(base + '/?reset&test=1');
  await mobile.waitForFunction(() => window.render_game_to_text);
  await mobile.evaluate(() => document.fonts.ready);
  await noHorizontalScroll(mobile);
  await mobile.screenshot({ path: `${output}/mobile-home.png` });
  await mobile.locator('#start-btn').click({ force: true });
  await mobile.waitForFunction(() => JSON.parse(window.render_game_to_text()).phase === 'answering');
  await noHorizontalScroll(mobile);
  await mobile.screenshot({ path: `${output}/mobile-round.png` });

  // Branding: no leftover Krillion text except the license credit.
  const visible = await page.evaluate(() => document.title + ' ' + document.body.innerText);
  assert.equal(await page.title(), 'Krilliohn');
  assert.ok(!/krillion/i.test(visible.replace(/OpenKrillion/g, '')), 'no Krillion in visible text except the credit');

  console.log('Yes run landings:\n  ' + yesLandings.join('\n  '));
  console.log('Other run landings:\n  ' + noLandings.join('\n  '));
  assert.deepEqual(outside, [], 'no requests leave the site');
  assert.deepEqual(errors, [], 'no page errors');
  console.log(`\nBrowser audit passed. Screenshots in ${output}/`);
} finally {
  await browser.close();
}
