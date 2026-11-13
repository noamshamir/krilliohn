# Krilliohn 🦐

A one-off special edition of a rare-answer trivia dive: nine fixed prompts, no clock, generous answer matching, and a final question. It runs as a static site with no server, no outside requests and no analytics.

Built on [OpenKrillion](https://github.com/VulcanEon/openkrillion.com-service) (MIT). See [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Personalize

Edit the `CONFIG` object at the top of [`public/config.mjs`](public/config.mjs) (her name, your name, the two ending messages, the share title, the site URL), then rebuild.

Prompts, tiers and aliases come from [`krillion_answers.json`](krillion_answers.json). The build copies only what the game needs into `dist/answers.mjs`, leaving out the `notes` fields.

## Run locally

```sh
npm ci
npm run dev        # builds dist/ and serves it at http://localhost:3051
```

- `?reset` clears saved progress (for example `http://localhost:3051/?reset`).
- Progress is saved in the browser, so a reload resumes the dive or reopens the ending.

## Test

```sh
npm test                                   # matcher + final-question unit tests
npm run dev                                # in a second terminal:
node scripts/browser-audit.mjs             # plays both endings in Chrome, screenshots in output/
```

## Scoring

All scoring is in [`public/matcher.mjs`](public/matcher.mjs):

- **Normalizing:** lowercase, accents stripped, `&` → `and`, punctuation → spaces, a leading "the" dropped. Hangul, Hebrew and CJK are kept, and answers are also compared with the spaces removed.
- **Match order:**
  1. An exact match wins: either a whole answer or alias, or whole words of an entry's display name, so "Noam Shamir", "hugo" or "kim" count.
  2. Next comes a typo match on a whole answer: 1 edit from 4 letters, 2 from 8, 3 from 13. Swapped letters count as one edit.
  3. Last comes word overlap. Any word of an answer counts, with typos, and split or joined words like "heungmin" count too. The most overlap wins.
- **Ties** go to the easiest tier, so shared names like Lee, Kim, Green and Hugo score low.
- **`not_accepted`** matches score 0 and show the prompt's note.
- **Unlisted answers** score 0 on `reject` prompts, and 30 on `partial_credit` prompts with "Not on our chart, but we'll allow it."
- **Final question:** repeated letters are collapsed first, then positive phrases like "why not" and "no doubt" are set aside. Any remaining negative word (no, nah, not, never, nope, don't, can't, won't, idk, maybe, plus 아니/싫어/לא/👎) means no. Otherwise an accepted phrase anywhere in the answer, a one-letter typo of one (yse, absolutley), or an emoji such as 👍 or ❤️ means yes.

## Deploy (GitHub Pages)

`.github/workflows/pages.yml` runs the tests, builds `dist/` and publishes it on every push to `main`.

1. On GitHub, under **Settings → Pages → Build and deployment**, set **Source** to **GitHub Actions**.
2. Forks have Actions turned off by default, so open the **Actions** tab and enable workflows.
3. Merge into `main` and push. The site appears at `https://<user>.github.io/krilliohn/`.

All paths are relative, so the site also works from any other static host or subfolder.
