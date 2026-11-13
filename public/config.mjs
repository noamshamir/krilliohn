// ╔══════════════════════════════════════════════════════════════════════╗
// ║  KRILLIOHN PERSONAL CONFIG: edit the text below, then `npm run build`. ║
// ║  Everything personal the game says lives in this one object.         ║
// ╚══════════════════════════════════════════════════════════════════════╝
export const CONFIG = {
  // Her name, shown on the title screen ("FOR …") and the endings.
  herName: 'HER NAME',
  // Your name, used in the sign-off on both endings.
  myName: 'Noam',
  // Shown on the special ending after a yes to the last question.
  yesMessage: 'PLACEHOLDER: the message she sees after saying yes.',
  // Shown on the normal results screen if the clock runs out on the last question
  // (every other answer to it gets another try).
  neutralMessage: 'PLACEHOLDER: the message she sees if the last answer is anything else.',
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
  siteUrl: 'https://noamshamir.github.io/krilliohn/',
};
