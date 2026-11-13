import { CONFIG } from './config.mjs';

// Internal tier ids are unchanged from the original code; names are what players see.
export const TIERS = {
  plankton: { name: 'Plankton', score: 10, emoji: '🫧', color: '#8fa3c4', blurb: 'The answer everyone blurts out.' },
  schooler: { name: 'Schooler', score: 30, emoji: '🐟', color: '#4de3ff', blurb: 'Solid. Swims with the school.' },
  rare: { name: 'Rare', score: 60, emoji: '🦑', color: '#ff5252', blurb: 'An uncommon answer. Nice pull.' },
  deepcut: { name: 'Deep Cut', score: 85, emoji: '🏮', color: '#9d7bff', blurb: 'True obscurity. Few go this deep.' },
  krillion: { name: 'One in a Krilliohn', score: 100, emoji: '🌟', color: '#ffd166', blurb: 'The designated gem. Trench floor.' },
};
// Purely visual, as in the original: the "Too Clever · 15" line in the descent
// ladder between Plankton and Schooler. No answer scores it.
export const LADDER = [['plankton', TIERS.plankton], ['tooclever', { name: 'Too Clever', score: 15, color: '#ff9f43' }], ...Object.entries(TIERS).slice(1)];
export const ROUNDS = 9;
export const PREVIEW_MS = 3000; // "the clock starts in 3" countdown, as in the original
export const ROUND_MS = 50000; // 50 seconds per answer (the original was 25)
export const MAX_SCORE = ROUNDS * 100;
export const METRES_PER_POINT = 10;
export const FLOOR_DEPTH = MAX_SCORE * METRES_PER_POINT; // 9,000m: the very bottom
export const BANDS = [
  { min: 0, max: 190, tier: 'plankton', name: 'Plankton', text: 'Plenty of ocean left down there.' },
  { min: 191, max: 320, tier: 'schooler', name: 'Schooler', text: 'Swimming with the school.' },
  { min: 321, max: 450, tier: 'rare', name: 'Rare', text: 'Below the thermocline. Nice.' },
  { min: 451, max: 580, tier: 'deepcut', name: 'Deep cut', text: 'Seriously deep dive.' },
  { min: 581, max: MAX_SCORE, tier: 'krillion', name: 'One in a Krilliohn', text: 'Trench dweller. Absurd.' },
];
export const bandFor = score => [...BANDS].reverse().find(b => score >= b.min) || BANDS[0];

export function shareText(results, { depth, link = '' } = {}) {
  const score = results.reduce((s, r) => s + r.score, 0);
  const metres = depth ?? score * METRES_PER_POINT;
  const grid = results.map(r => TIERS[r.tier]?.emoji || '⬛').join('');
  return `${CONFIG.shareTitle} 🦐\n${score}/${MAX_SCORE} · ${metres.toLocaleString('en-US')}m\n${grid}${link ? '\n' + link : ''}`;
}
