// Builds the static site into dist/ (deployable as-is to GitHub Pages).
import { mkdir, writeFile, copyFile, readFile, rm, cp } from 'node:fs/promises';
import sharp from 'sharp';
import { shrimp, fish, squid, angler } from './pixel-art.mjs';
import { homePage } from '../src/html.mjs';
import { prepareData } from '../public/matcher.mjs';

// Original pixel sprites, icons and font, generated into public/assets.
await mkdir('public/assets', { recursive: true });
const sprite = shrimp();
for (const [name, svg] of Object.entries({ 'krill': sprite, 'krill-gold': shrimp('gold'), 'evil': shrimp('evil'), 'schooler': fish(), 'tooclever': fish(true), 'rare': squid(), 'deepcut': angler() })) await writeFile('public/assets/' + name + '.svg', svg);
await copyFile('node_modules/@fontsource/vt323/files/vt323-latin-400-normal.woff2', 'public/assets/vt323-latin-400-normal.woff2');
await copyFile('node_modules/@fontsource/vt323/LICENSE', 'public/assets/VT323-LICENSE.txt');
for (const [size, name] of [[32, 'favicon.png'], [180, 'apple-touch-icon.png'], [256, 'icon.png']]) {
  const bg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${size / 6}" fill="#09192b"/></svg>`);
  await sharp(bg).composite([{ input: await sharp(Buffer.from(sprite)).resize(Math.floor(size * .8), Math.floor(size * .8), { kernel: 'nearest' }).png().toBuffer(), gravity: 'centre' }]).png().toFile('public/assets/' + name);
}
const title = text => [['#ff5d8f', 598, 213], ['#4de3ff', 605, 206], ['#e8f1ff', 601, 210]].map(([fill, x, y]) => `<text x="${x}" y="${y}" text-anchor="middle" font-family="monospace" font-size="96" font-weight="bold" letter-spacing="6" fill="${fill}">${text}</text>`).join('');
const og = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="#93d5e6"/><stop offset="1" stop-color="#dbf0f1"/></linearGradient><linearGradient id="sea" x2="0" y2="1"><stop stop-color="#1d5580"/><stop offset="1" stop-color="#050a14"/></linearGradient></defs><rect width="1200" height="630" fill="#050a14"/><path fill="url(#sky)" d="M0 0h1200v330H0z"/><path fill="url(#sea)" d="M0 320q150-12 300 0t300 0t300 0t300 0v310H0z"/><g fill="#fff" opacity=".75"><path d="M90 76h30V58h70V42h70v18h35v20h40v24H90zM860 60h40V42h80V26h50v18h40v24h50v22H860z"/></g>${title('KRILLIOHN')}<text x="600" y="275" text-anchor="middle" font-family="monospace" font-size="23" letter-spacing="7" fill="#258ca8">THE SPECIAL EDITION</text><text x="600" y="427" text-anchor="middle" font-family="monospace" font-size="25" fill="#d5e7f4">9 prompts · 50 seconds · think rare, dive deeper</text><rect x="300" y="480" width="600" height="67" fill="#101d33" stroke="#4de3ff" stroke-width="3"/><text x="600" y="524" text-anchor="middle" font-family="monospace" font-size="27" letter-spacing="5" fill="#e8f1ff">▼ BEGIN DESCENT ▼</text></svg>`;
await sharp(Buffer.from(og)).png().toFile('public/assets/og.png');

// Static output: page, assets, browser-only answer data and the license notices.
await rm('dist', { recursive: true, force: true });
await cp('public', 'dist', { recursive: true });
await writeFile('dist/index.html', homePage());
const data = prepareData(JSON.parse(await readFile('krillion_answers.json', 'utf8')));
await writeFile('dist/answers.mjs', `// Generated from krillion_answers.json by scripts/build.mjs.\nexport default ${JSON.stringify(data)};\n`);
await copyFile('LICENSE', 'dist/LICENSE.txt');
await writeFile('dist/.nojekyll', '');
await writeFile('dist/robots.txt', 'User-agent: *\nDisallow: /\n');
console.log(`Built dist/: ${data.questions.length} prompts + final question, ${data.questions.reduce((n, q) => n + Object.values(q.tiers).flat().length, 0)} listed answers.`);
