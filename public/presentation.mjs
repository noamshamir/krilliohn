import { TIERS } from './rules.mjs';
export const DROP_MS = { plankton: 3400, tooclever: 3000, schooler: 3000, rare: 3400, deepcut: 4300, krillion: 4600, yes: 7000, miss: 900 };
export const easeInOut = t => t < .5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
export const easeOut = t => 1 - (1 - t) ** 3;
export const iconFor = tier => ({ krillion: 'krill', plankton: 'plankton', tooclever: 'tooclever', schooler: 'schooler', rare: 'rare', deepcut: 'deepcut' })[tier];
export const tierImage = (tier, cls = '') => tier ? `<img class="${cls}" src="assets/${iconFor(tier)}.svg" alt="" width="24" height="24">` : '<span class="miss-icon">⬛</span>';
const logDepth={plankton:8,tooclever:18,schooler:36,rare:60,deepcut:82,krillion:97};
export function diveChart(results, escape) {
  return `<div class="dive-chart" role="img" aria-label="Answer scores, zero at the surface and 100 at the deepest point">${[0,25,50,75,100].map(n=>`<div class="chart-grid" style="top:${n}%"><span>${n===0?'0m':'−'+n}</span></div>`).join('')}<div class="dive-columns">${results.map((r,i)=>`<div class="dive-column" title="Round ${i+1}: ${escape(r.answer||'miss')}, ${r.score} points" style="--drop:${logDepth[r.tier]??3}%;--delay:${i*90}ms;--dot-color:${TIERS[r.tier]?.color||'#43556b'}"><div class="dive-stem"></div><div class="dive-dot">${tierImage(r.tier)}</div><span>${i+1}</span></div>`).join('')}</div></div>`;
}
