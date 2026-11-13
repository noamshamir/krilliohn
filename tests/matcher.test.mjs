import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { prepareData, matchGuess, judgeFinal, classifyReply, normalize, distance, TIER_ORDER, TIER_ID } from '../public/matcher.mjs';
import { shareText, TIERS, ROUNDS, MAX_SCORE, FLOOR_DEPTH, ROUND_MS, PREVIEW_MS } from '../public/rules.mjs';
import { CONFIG } from '../public/config.mjs';

const RAW = JSON.parse(readFileSync(new URL('../krillion_answers.json', import.meta.url), 'utf8'));
const DATA = prepareData(RAW);
const byPrompt = text => { const q = DATA.questions.find(q => q.prompt.startsWith(text)); assert.ok(q, `prompt "${text}" exists`); return q; };
const MARIO = byPrompt('Name a Mario Kart item'), KPOP = byPrompt('Name a K-pop singer'), PIGEON = byPrompt('Name a GamePigeon game'), LINALG = byPrompt('Name a linear algebra term'), SOCCER = byPrompt('Name a Korean, Tottenham'), DRINK = byPrompt('Name an alcoholic beverage'), SCANDAL = byPrompt('Name a Nic Wang'), DATES = byPrompt('Name a date we');
const expectMatch = (q, guess, answer, tier) => {
  const r = matchGuess(q, guess);
  assert.equal(r.kind, 'match', `${guess} should match`);
  assert.equal(r.answer, answer, `${guess} → ${answer}`);
  assert.equal(r.tier, tier, `${guess} → ${tier}`);
  assert.equal(r.score, TIERS[tier].score);
  return r;
};

test('prompts are the nine fixed prompts, in order', () => {
  assert.deepEqual([...DATA.questions.map(q => q.prompt), DATA.final.prompt], [
    'Name a Mario Kart item', 'Name a K-pop singer', "Name a GamePigeon game we've played", "Name a linear algebra term we've learned", "Name a Korean, Tottenham, or St. Stephen's soccer player", 'Name an alcoholic beverage', 'Name a Nic Wang or Isaac Lin scandal/incident', "Name a date we've been on / something we've done together", 'Would you let me be your boyfriend?',
  ]);
  assert.equal(ROUNDS, 9);
});

test('browser data drops authoring notes', () => {
  const text = JSON.stringify(DATA);
  for (const word of ['notes', 'full_lists', 'sore spot', 'wikipedia']) assert.ok(!text.includes(word), word);
});

test('requested matcher cases', () => {
  expectMatch(SOCCER, 'sonny', 'Son Heung-min', 'plankton');
  expectMatch(SOCCER, 'hyunggyu', 'Oh Hyeon-gyu', 'krillion');
  expectMatch(PIGEON, '20q', '20 Questions', 'krillion');
  expectMatch(DRINK, 'Mai Tai', 'Mai tai', 'deepcut');
  expectMatch(DRINK, 'moutai', 'Maotai', 'krillion');
  expectMatch(LINALG, 'therefore', 'Therefore', 'deepcut');
  expectMatch(LINALG, 'contrapositive', 'Contrapositive', 'krillion'); // replaces Linearize, removed from the list
  expectMatch(LINALG, 'cauchy schwartz', 'Cauchy-Schwarz', 'krillion');
});

test('"lee" scores the easiest tier it matches', () => {
  const lowest = Math.min(...TIER_ORDER.flatMap(key => (SOCCER.tiers[key] || []).filter(e => e.some(a => normalize(a) === 'lee')).map(() => TIERS[TIER_ID[key]].score)));
  const r = matchGuess(SOCCER, 'lee');
  assert.equal(r.score, lowest);
  assert.equal(r.tier, 'plankton');
});

test('the answer clock is twice the original 25 seconds, after a 3-second descent', () => {
  assert.equal(ROUND_MS, 50000);
  assert.equal(PREVIEW_MS, 3000);
});

test('not accepted answers are wrong and carry the prompt note (the game asks again)', () => {
  const r = matchGuess(LINALG, 'determinant');
  assert.deepEqual([r.kind, r.score, r.tier, r.message], ['not_accepted', 0, null, RAW.questions.find(q => q.prompt.startsWith('Name a linear')).not_accepted.note]);
  assert.equal(matchGuess(SOCCER, 'Ange').message, 'Manager, not a player');
  assert.equal(matchGuess(PIGEON, 'mini golf').kind, 'not_accepted');
});

test('unlisted answers are misses on every prompt (the game asks again)', () => {
  const kpop = matchGuess(KPOP, 'Ailee');
  assert.deepEqual([kpop.kind, kpop.tier, kpop.score], ['miss', null, 0]);
  const pigeon = matchGuess(PIGEON, 'Bowling');
  assert.deepEqual([pigeon.kind, pigeon.score, pigeon.tier], ['miss', 0, null]);
  assert.equal(matchGuess(DRINK, 'zzzz').kind, 'miss');
});

test('mai tai never drifts into Maotai, and Maotai spellings still land', () => {
  for (const guess of ['mai tai', 'MAI TAI', 'maitai', 'Mai-Tai', 'mai tais', 'the mai tai']) expectMatch(DRINK, guess, 'Mai tai', 'deepcut');
  for (const guess of ['maotai', 'mao tai', 'moutai', 'Kweichow Moutai', '茅台']) expectMatch(DRINK, guess, 'Maotai', 'krillion');
});

test('normalization: case, accents, &, punctuation, spaces, leading "the", non-Latin scripts', () => {
  assert.equal(normalize('  The   Jägermeister!! '), 'jagermeister');
  assert.equal(normalize('Dots & Boxes'), 'dots and boxes');
  assert.equal(normalize('Rosé'), 'rose');
  assert.equal(normalize('손흥민'), '손흥민');
  assert.equal(normalize('כן'), 'כן');
  assert.equal(normalize('茅台'), '茅台');
  expectMatch(DRINK, 'JAGERMEISTER', 'Jägermeister', 'rare');
  expectMatch(SOCCER, '손흥민', 'Son Heung-min', 'plankton');
  expectMatch(PIGEON, 'wordhunt', 'Word Hunt', 'rare');
  expectMatch(PIGEON, 'word-hunt', 'Word Hunt', 'rare');
  expectMatch(LINALG, '∴', 'Therefore', 'deepcut');
});

test('generous typo tolerance, including swapped letters', () => {
  assert.equal(distance('yse', 'yes'), 1);
  expectMatch(KPOP, 'jungkok', 'Jungkook', 'plankton');
  expectMatch(KPOP, 'Jungkoook', 'Jungkook', 'plankton');
  expectMatch(MARIO, 'bannana', 'Banana', 'plankton');
  expectMatch(MARIO, 'triple shrooms', 'Triple Mushroom', 'schooler');
  expectMatch(SOCCER, 'Kulusevksi', 'Dejan Kulusevski', 'schooler');
  expectMatch(LINALG, 'lineer combinaton', 'Linear combination', 'schooler');
});

test('part of an answer is enough', () => {
  expectMatch(SOCCER, 'Noam Shamir', "Noam Shamir (St. Stephen's)", 'plankton');
  expectMatch(SOCCER, 'heungmin', 'Son Heung-min', 'plankton');
  expectMatch(SOCCER, 'hugo', 'Hugo Lloris', 'schooler');
  expectMatch(SCANDAL, 'when nic set off the fire alarm', 'Setting off the fire alarm in 9th grade (Nic)', 'schooler');
  expectMatch(SCANDAL, 'the rubber ducky method', "Isaac's Rubber Ducky essay method", 'rare');
  expectMatch(SCANDAL, 'isaac walked ahead of me at the mall', 'Isaac walking ahead of you the whole time at the mall', 'krillion');
  expectMatch(SCANDAL, 'nic becoming a social democrat', 'Nic being a bitch-ass social democrat senior year after larping maoism 9-11th grade', 'krillion');
  expectMatch(DATES, 'noraebang', 'Karaoke', 'rare');
  expectMatch(DATES, 'fortune teller', 'Fortune-teller', 'deepcut');
  expectMatch(DATES, 'got trapped in a garage', 'Getting trapped in a parking garage', 'krillion');
  expectMatch(DATES, 'studying linear at merit', 'Studying linear at Merit Cafe', 'rare');
  expectMatch(DATES, 'walking to the health center', 'Riding to the health center', 'deepcut');
  expectMatch(MARIO, 'shell', 'Blue Shell', 'plankton');
  expectMatch(DRINK, 'tequila shots', 'Tequila', 'plankton');
});

test('words from the question alone are not an answer', () => {
  for (const guess of ['nic', 'isaac', 'Nic Wang', 'isaac lin', 'scandal']) assert.equal(matchGuess(SCANDAL, guess).kind, 'miss', guess);
  for (const guess of ['linear', 'algebra']) assert.equal(matchGuess(LINALG, guess).kind, 'miss', guess);
  assert.equal(matchGuess(PIGEON, 'game').kind, 'miss');
});

test('a not-accepted note needs the term itself, not a shared word', () => {
  assert.equal(matchGuess(LINALG, 'theorem').kind, 'miss');
  assert.equal(matchGuess(LINALG, 'rank nullity theorem').kind, 'not_accepted');
});

test('removed answers no longer score', () => {
  for (const [q, guess] of [[LINALG, 'linearizing'], [LINALG, 'theorem'], [DATES, 'just dance'], [DATES, 'hot pot'], [DATES, 'tacodeli'], [SCANDAL, 'chipotle']]) assert.notEqual(matchGuess(q, guess).kind, 'match', guess);
});

test('an explicit alias beats a shared word elsewhere', () => {
  expectMatch(DATES, 'the party', "Jenna/Athena's party", 'deepcut');
  expectMatch(LINALG, 'set', 'Set', 'rare');
  expectMatch(LINALG, 'matrix', 'Matrix', 'plankton');
  assert.equal(matchGuess(LINALG, 'linear map').kind, 'not_accepted');
  assert.equal(matchGuess(LINALG, 'inverse of a matrix').kind, 'not_accepted');
});

test('every listed answer and alias lands on its own entry or an easier shared one', () => {
  const rank = tier => ['plankton', 'schooler', 'rare', 'deepcut', 'krillion'].indexOf(tier);
  for (const q of DATA.questions) {
    for (const key of TIER_ORDER) for (const entry of q.tiers[key] || []) for (const alias of entry) {
      const r = matchGuess(q, alias);
      assert.equal(r.kind, 'match', `${q.prompt}: ${alias}`);
      assert.ok(rank(r.tier) <= rank(TIER_ID[key]), `${alias} scored harder than its own tier`);
    }
    for (const entry of q.notAccepted?.answers || []) for (const alias of entry) assert.equal(matchGuess(q, alias).kind, 'not_accepted', `${q.prompt}: ${alias}`);
  }
});

test('empty input is not an answer', () => {
  assert.equal(matchGuess(MARIO, ''), null);
  assert.equal(matchGuess(MARIO, '   '), null);
  assert.equal(judgeFinal(DATA.final, ' '), null);
});

test('final question: requested yes answers', () => {
  for (const yes of ['yesss', 'of course', 'why not', '👍', '네']) assert.equal(judgeFinal(DATA.final, yes).kind, 'yes', yes);
});

test('final question: every kind of no is refused (the joke)', () => {
  for (const no of ['absolutely not', 'of course not', 'maybe', 'no', 'idk', 'nope', 'nah', 'naww', 'nooooo', 'NO!!!', 'no way', 'noway', 'hell no', 'no thanks', 'never', 'not really', "don't think so", "i can't", 'yes but no', 'lol no', 'nein', 'לא', '아니', '아니요', '싫어', '👎', '❌']) {
    const r = judgeFinal(DATA.final, no);
    assert.deepEqual([r.kind, r.score, r.tier], ['no', 0, null], no);
  }
});

test('final question: whole accepted and rejected lists from the JSON', () => {
  for (const yes of RAW.final_question.accepted) assert.equal(judgeFinal(DATA.final, yes).kind, 'yes', yes);
  for (const no of RAW.final_question.rejected_examples) assert.notEqual(judgeFinal(DATA.final, no).kind, 'yes', no);
});

test('final question: generous yes; anything else is neither yes nor no', () => {
  for (const yes of ['YES!!!', 'omg yes', 'Noam, yes', 'um of course!!', 'yse', 'absolutley', 'ofcourse', 'yesyes', "I thought you'd never ask", 'sure why not', '❤️❤️❤️', 'yes ❤️', 'no doubt', 'Yes Sir']) assert.equal(classifyReply(DATA.final, yes), 'yes', yes);
  for (const other of ['let me think', 'ask me later', 'purple', 'hmm']) assert.equal(classifyReply(DATA.final, other), 'other', other);
});

test('final answer scores One in a Krilliohn or 0', () => {
  assert.deepEqual([judgeFinal(DATA.final, 'yes').tier, judgeFinal(DATA.final, 'yes').score], ['krillion', 100]);
  assert.deepEqual([judgeFinal(DATA.final, 'no').tier, judgeFinal(DATA.final, 'no').score], [null, 0]);
  assert.deepEqual([judgeFinal(DATA.final, 'hmm').tier, judgeFinal(DATA.final, 'hmm').score], [null, 0]);
  assert.equal(TIERS.krillion.name, 'One in a Krilliohn');
});

test('share text keeps the emoji grid with the configured title', () => {
  const results = [{ tier: 'plankton', score: 10 }, { tier: 'schooler', score: 30 }, { tier: null, score: 0 }, { tier: 'krillion', score: 100 }];
  assert.equal(shareText(results), `${CONFIG.shareTitle} 🦐\n140/${MAX_SCORE} · 1,400m\n🫧🐟⬛🌟`);
  assert.equal(shareText(results, { depth: FLOOR_DEPTH, link: 'https://example.com/' }), `${CONFIG.shareTitle} 🦐\n140/900 · 9,000m\n🫧🐟⬛🌟\nhttps://example.com/`);
});
