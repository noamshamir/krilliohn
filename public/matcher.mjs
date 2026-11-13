// Offline answer matching for Krilliohn. Pure functions: used by the game,
// the build (data preparation) and the unit tests.

// JSON tier keys, easiest first, mapped to the game's internal tier ids.
export const TIER_ORDER = ['plankton', 'schooler', 'rare', 'deep_cut', 'one_in_a_krillion'];
export const TIER_ID = { plankton: 'plankton', schooler: 'schooler', rare: 'rare', deep_cut: 'deepcut', one_in_a_krillion: 'krillion' };
export const TIER_POINTS = { plankton: 10, schooler: 30, rare: 60, deepcut: 85, krillion: 100 };
export const PARTIAL_CREDIT_MESSAGE = 'Not on our chart, but we’ll allow it.';

// Keep only what the browser needs (drops authoring notes and links).
export function prepareData(raw) {
  const questions = [...raw.questions].sort((a, b) => a.order - b.order).map(q => ({
    prompt: q.prompt,
    unlisted: q.unlisted_answers === 'partial_credit' ? 'partial_credit' : 'reject',
    tiers: Object.fromEntries(TIER_ORDER.filter(t => q.tiers[t]).map(t => [t, q.tiers[t]])),
    notAccepted: q.not_accepted ? { note: q.not_accepted.note, answers: q.not_accepted.answers } : null,
  }));
  return { questions, final: { prompt: raw.final_question.prompt, accepted: raw.final_question.accepted } };
}

// ---------------------------------------------------------------- normalizing
const FOLD = { 'ø': 'o', 'æ': 'ae', 'œ': 'oe', 'ß': 'ss', 'ł': 'l', 'đ': 'd', 'ð': 'd', 'þ': 'th', 'ı': 'i' };
export function normalize(value) {
  let s = String(value ?? '').normalize('NFKD').replace(/\p{M}/gu, '').normalize('NFC').toLowerCase();
  s = s.replace(/[øæœßłđðþı]/g, c => FOLD[c]).replace(/&/g, ' and ');
  s = s.replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
  if (s.startsWith('the ')) s = s.slice(4);
  return s;
}
// Symbol answers (∴, ⇒, ∃) vanish under normalize(); compare those as typed.
const rawKey = value => String(value ?? '').normalize('NFKC').toLowerCase().replace(/\s+/g, '');
const stripParens = value => String(value).replace(/\([^)]*\)/g, ' ');

// Optimal string alignment distance (Levenshtein + adjacent swaps), with early exit.
export function distance(a, b, limit = Infinity) {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let prev2 = null, prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(row[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      row[j] = v;
      if (v < best) best = v;
    }
    if (best > limit) return limit + 1;
    prev2 = prev; prev = row;
  }
  return prev[b.length];
}
// Typo allowance grows with the length of the answer being compared against.
export const allowance = length => (length >= 13 ? 3 : length >= 8 ? 2 : length >= 4 ? 1 : 0);

// --------------------------------------------------------------- word overlap
const STOP = new Set('the a an of in on at to and or for with by from my his her their our your me we i you he she it its is was were be been that this as s t st did do does got get when went time'.split(' '));
const isContent = t => (/^\p{N}+$/u.test(t) ? t.length >= 2 : t.length >= 2 && !STOP.has(t));
// How many letters of `target` a guessed word earns: its length, minus typos.
function wordValue(guess, target) {
  if (guess === target) return target.length;
  const limit = allowance(target.length), d = distance(guess, target, limit);
  return d <= limit ? Math.min(guess.length, target.length) - d : 0;
}

// Letters of the answer's meaningful words that the guess covers. Words match
// with typos, and split/joined words count ("heungmin" ~ "heung min").
function overlap(guessTokens, form) {
  const units = guessTokens.filter(isContent);
  for (let i = 0; i + 1 < guessTokens.length; i++) { const joined = guessTokens[i] + guessTokens[i + 1]; if (joined.length >= 4) units.push(joined); }
  if (!units.length) return 0;
  const earned = new Map();
  const credit = (indexes, value) => { if (value > 0 && value > indexes.reduce((n, j) => n + (earned.get(j) || 0), 0)) indexes.forEach((j, k) => earned.set(j, k ? 0 : value)); };
  form.tokens.forEach((t, j) => { if (isContent(t)) credit([j], Math.max(0, ...units.map(u => wordValue(u, t)))); });
  for (let j = 0; j + 1 < form.tokens.length; j++) {
    const joined = form.tokens[j] + form.tokens[j + 1];
    if (joined.length >= 4) credit([j, j + 1], Math.max(0, ...units.map(u => wordValue(u, joined))));
  }
  let letters = 0;
  for (const value of earned.values()) letters += value;
  return letters;
}

// ------------------------------------------------------------------- indexing
const indexCache = new WeakMap();
function makeForm(text, isName = false) {
  const norm = normalize(text);
  const tokens = norm ? norm.split(' ') : [];
  return { norm, flat: norm.replace(/ /g, ''), raw: rawKey(text), tokens, isName, content: tokens.filter(isContent).reduce((n, t) => n + t.length, 0) };
}
function indexQuestion(question) {
  if (indexCache.has(question)) return indexCache.get(question);
  const entries = [];
  const add = (list, extra) => list.forEach(entry => {
    const [display, ...aliases] = entry;
    const forms = [makeForm(display), makeForm(stripParens(display), true), ...aliases.map(a => makeForm(a))];
    entries.push({ display, ...extra, order: entries.length, forms: forms.filter(f => f.norm || f.raw) });
  });
  TIER_ORDER.forEach((key, rank) => add(question.tiers[key] || [], { kind: 'tier', tier: TIER_ID[key], rank }));
  if (question.notAccepted) add(question.notAccepted.answers, { kind: 'not_accepted', rank: 99 });
  indexCache.set(question, entries);
  return entries;
}

// True when the guess's words appear, in order and spelled exactly, inside the answer.
function containsRun(tokens, run) {
  outer: for (let i = 0; i + run.length <= tokens.length; i++) {
    for (let k = 0; k < run.length; k++) if (tokens[i + k] !== run[k]) continue outer;
    return true;
  }
  return false;
}

// Best way a guess matches one entry: 3 exact (a whole answer, or whole words
// of the entry's display name, so a shared name like "Lee", "Kim" or "Hugo"
// takes the easiest tier), 2 typo of a whole answer, 1 word overlap.
function grade(guess, entry) {
  if (entry.forms.some(form => (form.norm && (form.norm === guess.norm || form.flat === guess.flat)) || (form.raw && form.raw === guess.raw))) return { level: 3, whole: true };
  if (guess.content && entry.forms.some(form => form.isName && containsRun(form.tokens, guess.tokens))) return { level: 3, whole: false };
  let best = null;
  const better = c => !best || c.level > best.level || (c.level === best.level && (c.level === 2 ? c.distance < best.distance : c.letters > best.letters || (c.letters === best.letters && c.cover > best.cover)));
  for (const form of entry.forms) {
    if (!guess.flat || !form.flat) continue;
    const limit = allowance(form.flat.length);
    if (limit) {
      const d = Math.min(distance(guess.norm, form.norm, limit), distance(guess.flat, form.flat, limit));
      if (d <= limit) { const c = { level: 2, distance: d }; if (better(c)) best = c; }
    }
    if (!best || best.level < 2) {
      const letters = overlap(guess.tokens, form);
      if (letters) { const c = { level: 1, letters, cover: letters / Math.max(1, form.content) }; if (better(c)) best = c; }
    }
  }
  return best;
}
function compare(a, b) {
  if (a.level !== b.level) return b.level - a.level;
  if (a.level === 2 && a.distance !== b.distance) return a.distance - b.distance;
  if (a.level === 1 && a.letters !== b.letters) return b.letters - a.letters;
  if (a.entry.kind !== b.entry.kind) return a.entry.kind === 'tier' ? -1 : 1;
  if (a.entry.rank !== b.entry.rank) return a.entry.rank - b.entry.rank; // easiest tier wins
  if (a.level === 3 && a.whole !== b.whole) return a.whole ? -1 : 1;
  if (a.level === 1 && a.cover !== b.cover) return b.cover - a.cover;
  return a.entry.order - b.entry.order;
}

// Scores one guess against one prompt. Returns null for an empty guess.
export function matchGuess(question, input) {
  const rawAnswer = String(input ?? '').trim().slice(0, 256);
  if (!rawAnswer) return null;
  const norm = normalize(rawAnswer);
  const tokens = norm ? norm.split(' ') : [];
  const guess = { norm, flat: norm.replace(/ /g, ''), raw: rawKey(rawAnswer), tokens, content: tokens.some(isContent) };
  const candidates = [];
  for (const entry of indexQuestion(question)) { const g = grade(guess, entry); if (g) candidates.push({ ...g, entry }); }
  candidates.sort(compare);
  const top = candidates[0];
  const how = top ? ({ 3: 'exact', 2: 'typo', 1: 'partial' })[top.level] : null;
  if (top?.entry.kind === 'tier') return { rawAnswer, answer: top.entry.display, tier: top.entry.tier, score: TIER_POINTS[top.entry.tier], kind: 'match', how, message: null };
  if (top) return { rawAnswer, answer: top.entry.display, tier: null, score: 0, kind: 'not_accepted', how, message: question.notAccepted.note };
  if (question.unlisted === 'partial_credit') return { rawAnswer, answer: rawAnswer, tier: 'schooler', score: TIER_POINTS.schooler, kind: 'unlisted', how: null, message: PARTIAL_CREDIT_MESSAGE };
  return { rawAnswer, answer: null, tier: null, score: 0, kind: 'miss', how: null, message: null };
}

// ------------------------------------------------------------- final question
// Positive phrases that happen to contain a negative word.
const POSITIVE_NEGATIONS = ['why not', 'no doubt', 'no question', 'no brainer', 'never ask'];
const NEGATIONS = new Set(['no', 'nah', 'not', 'never', 'nope', 'nop', 'dont', 'cant', 'wont', 'cannot', 'idk', 'dunno', 'maybe', 'unsure', 'nay', 'nein', 'nada', 'nty', 'pass', 'לא', '👎', '❌', '🙅', '💔']);
const NEGATION_FRAGMENTS = ['아니', '아닌', '싫', '안돼', '안 돼', '안해', '안 해', '별로'];

export function normalizeReply(value) {
  let s = String(value ?? '').normalize('NFKC').toLowerCase();
  s = s.replace(/[’'ʼ`]/g, '').replace(/&/g, ' and ');
  s = s.normalize('NFKD').replace(/\p{M}/gu, '').normalize('NFC');
  s = s.replace(/[^\p{L}\p{N}\p{Extended_Pictographic}]+/gu, ' ').replace(/(\p{Extended_Pictographic})/gu, ' $1 ');
  s = s.replace(/(\p{L}|\p{Extended_Pictographic})\1+/gu, '$1'); // yessss -> yes (digits untouched: 100)
  return s.trim().replace(/\s+/g, ' ');
}
const containsPhrase = (text, phrase) => phrase && ` ${text} `.includes(` ${phrase} `);
const replyCache = new WeakMap();
function acceptedForms(final) {
  if (!replyCache.has(final)) replyCache.set(final, [...new Set(final.accepted.map(normalizeReply).filter(Boolean))]);
  return replyCache.get(final);
}

// true when the answer to the last question is a yes.
export function isYes(final, input) {
  const text = normalizeReply(input);
  if (!text) return false;
  let rest = text;
  for (const phrase of POSITIVE_NEGATIONS) while (containsPhrase(rest, phrase)) rest = ` ${rest} `.replace(` ${phrase} `, ' ').trim();
  if (rest.split(' ').some(t => NEGATIONS.has(t)) || NEGATION_FRAGMENTS.some(f => rest.includes(f))) return false;
  const accepted = acceptedForms(final), flat = text.replace(/ /g, ''), tokens = text.split(' ');
  if (accepted.some(p => containsPhrase(text, p))) return true;
  if (accepted.some(p => { const f = p.replace(/ /g, ''); return f.length >= 3 && flat.startsWith(f); })) return true;
  const words = [...tokens];
  for (let i = 0; i + 1 < tokens.length; i++) words.push(tokens[i] + tokens[i + 1]);
  return accepted.some(p => {
    if (p.includes(' ') || !/^\p{L}+$/u.test(p) || (p.length < 4 && p !== 'yes')) return false;
    const limit = p.length >= 8 ? 2 : 1;
    return words.some(w => distance(w, p, limit) <= limit);
  });
}

export function judgeFinal(final, input) {
  const rawAnswer = String(input ?? '').trim().slice(0, 256);
  if (!rawAnswer) return null;
  return isYes(final, rawAnswer)
    ? { rawAnswer, answer: rawAnswer, tier: 'krillion', score: TIER_POINTS.krillion, kind: 'yes', how: null, message: null }
    : { rawAnswer, answer: rawAnswer, tier: null, score: 0, kind: 'no', how: null, message: null };
}
