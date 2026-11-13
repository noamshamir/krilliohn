# Krilliohn 🦐

A one-off special edition of a rare-answer trivia dive: nine fixed prompts, 50 seconds each, generous answer matching, and a final question. It runs as a static site with no server, no outside requests and no analytics.

Built on [OpenKrillion](https://github.com/VulcanEon/openkrillion.com-service) (MIT). See [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Personalize

Edit the `CONFIG` object at the top of [`public/config.mjs`](public/config.mjs) (her name, your name, the two ending messages, the jokes that refuse a "no", the share title, the site URL), then rebuild.

Prompts, tiers and aliases come from [`krillion_answers.json`](krillion_answers.json). The build copies only what the game needs into `dist/answers.mjs`, leaving out the `notes` fields.

## Run locally

```sh
npm ci
npm run dev        # builds dist/ and serves it at http://localhost:3051
```

- Nothing is saved between visits. Reloading the page, or choosing **Back to the dive** in the menu, starts over from the title screen. The menu's × just closes the menu.
- Only settings (sound, low-power, colorblind, dive buddy) are remembered in the browser.

## The clock

Each prompt starts with the original 3-second "the clock starts in" countdown, then gives 50 seconds to answer (the original gave 25). The last 3 seconds tick and glow red. When time runs out, whatever is typed is scored, or scores 0 if it isn't on the list. The clock pauses while a menu is open and while the page is hidden, so switching apps doesn't use up time.

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
- **Wrong answers get another try**, as in the original game. An unlisted answer shows "no echo. try again", and a `not_accepted` answer shows the prompt's note. The JSON's `partial_credit` setting is no longer used.
- **Final question:**
  - Repeated letters are collapsed first, then positive phrases like "why not" and "no doubt" are set aside.
  - Any remaining negative word means no: no, nah, nope, not, never, don't, can't, won't, idk, maybe, plus 아니, 싫어, לא and 👎.
  - Every kind of no is refused as a joke: one of `CONFIG.noReplies` appears, the box empties, and she tries again.
  - An accepted phrase anywhere in the answer, a one-letter typo of one (yse, absolutley), or an emoji such as 👍 or ❤️ means yes. Yes scores One in a Krilliohn, sends the depth meter to the 9,000m floor and shows the special ending.
  - Any other answer gets "no echo. try again".
  - Only running out the clock ends on the normal results screen, with `CONFIG.neutralMessage`.

## Deploy (GitHub Pages)

`.github/workflows/pages.yml` runs the tests, builds `dist/` and publishes it on every push to `main`.

1. On GitHub, under **Settings → Pages → Build and deployment**, set **Source** to **GitHub Actions**.
2. Forks have Actions turned off by default, so open the **Actions** tab and enable workflows.
3. Merge into `main` and push. The site appears at `https://<user>.github.io/krilliohn/`.

All paths are relative, so the site also works from any other static host or subfolder.
