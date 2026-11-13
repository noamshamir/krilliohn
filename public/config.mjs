// ╔══════════════════════════════════════════════════════════════════════╗
// ║  KRILLIOHN PERSONAL CONFIG: edit the text below, then `npm run build`. ║
// ║  Everything personal the game says lives in this one object.         ║
// ╚══════════════════════════════════════════════════════════════════════╝
export const CONFIG = {
  // Her name, shown on the title screen ("FOR …").
  herName: 'Grace',
  // Your name. Added as "— Noam" under an ending message unless it already ends with it.
  myName: 'Noam',
  // Shown on the special ending after a yes to the last question.
  // Blank lines separate paragraphs; single line breaks are kept.
  yesMessage: `Grace,

If you’ll please excuse how pretentious this will sound and how it will definitely make you cringe:

For as long as I can remember, music has been my refuge from the world. Playing it or listening to it, jazz or folk or classical, it lives in an isolated part of my heart and head that all else fails to reach.

The development of our relationship these past few weeks has surprised me. For months I thought of us just as close friends, and I’m a little disappointed it took me so long to figure out why that changed. But it fills me with nothing short of ecstasy that I finally did.

It’s because you, to me, are music. Many times I feel that you reach this isolated part of my mind and heart. To extend the metaphor to a tiresome and probably cringe point: yours is the melody stuck in my head and ever-occupying my heart.

Yours,
Noam`,
  // Shown on the normal results screen if the clock runs out on the last question
  // (every other answer to it gets another try). A stand-in: rewrite it if you like.
  neutralMessage: 'The clock ran out on the last one. Guess I’ll have to ask you in person.',
  // The last question refuses any "no" with one of these (in order, then repeating).
  // The answer box empties each time. {answer} is replaced with what she typed.
  noReplies: [
    '“{answer}”? the ocean didn’t catch that. try again',
    'hmm, that must be a typo. try again',
    'nice try. “no” isn’t one of the options',
    'error: answer too wrong. try again',
    'the krill refuse to carry that answer down. try again',
  ],
  // First line of the copied/shared emoji grid.
  shareTitle: 'Krilliohn',
  // Public address of the site. Link previews (iMessage etc.) need it to show the image.
  siteUrl: 'https://krilliohn.com/',
};
