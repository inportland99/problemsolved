/**
 * ============================================================
 *  EDIT THIS FILE TO ADD OR CHANGE SPECTRUM PROMPTS
 * ============================================================
 *
 * Each entry is one spectrum: `left` is the far-left extreme and
 * `right` is the far-right extreme. Keep them short — they are
 * displayed in very large type across a room.
 *
 * Add as many as you like; the game picks one at random each round
 * and never repeats the same one twice in a row.
 */
export const PROMPTS = [
  { left: 'Worthless', right: 'Priceless' },
  { left: 'Bad Pizza Topping', right: 'Great Pizza Topping' },
  { left: 'Easy To Kill', right: 'Hard To Kill' },
  { left: 'Bad Superpower', right: 'Great Superpower' },
  { left: 'Not Impressive', right: 'Very Impressive' },
  { left: 'Bad First Date', right: 'Great First Date' },
  { left: 'Boring', right: 'Exciting' },
  { left: 'Unnecessary', right: 'Essential' },
  { left: 'Easy', right: 'Difficult' },
  { left: 'Forgettable', right: 'Memorable' },
  { left: 'Underrated', right: 'Overrated' },
  { left: 'Bad Habit', right: 'Good Habit' },
  { left: 'Quiet', right: 'Loud' },
  { left: 'Guilty Pleasure', right: 'Genuinely Great' },
  { left: 'Cheap', right: 'Expensive' },
  { left: 'Bad Gift', right: 'Great Gift' },
  { left: 'Weird', right: 'Normal' },
  { left: 'Temporary', right: 'Permanent' },
  { left: 'Junk Food', right: 'Health Food' },
  { left: 'Bad Advice', right: 'Good Advice' },
  { left: 'Casual', right: 'Formal' },
  { left: 'Waste Of Time', right: 'Time Well Spent' },
  { left: 'Hard To Explain', right: 'Easy To Explain' },
  { left: 'Bad Smell', right: 'Great Smell' },
  { left: 'Overhyped Movie', right: 'Deserves The Hype' },
  { left: 'Small Problem', right: 'Huge Problem' },
  { left: 'Bad Excuse', right: 'Great Excuse' },
  { left: 'Ugly', right: 'Beautiful' },
  { left: 'Simple', right: 'Complicated' },
  { left: 'Terrible Job', right: 'Dream Job' },
  { left: 'Nobody Likes It', right: 'Everybody Likes It' },
  { left: 'Bad Icebreaker', right: 'Great Icebreaker' },
  { left: 'Fleeting Trend', right: 'Timeless Classic' },
  { left: 'Uncomfortable', right: 'Cozy' },
  { left: 'Bad Math Problem', right: 'Beautiful Math Problem' },
  { left: 'Boring Subject', right: 'Fascinating Subject' },
];

/**
 * Pick a random prompt, avoiding an immediate repeat.
 * @param {number} [excludeIndex] index of the prompt just used
 * @returns {{index: number, prompt: {left: string, right: string}}}
 */
export function pickPrompt(excludeIndex) {
  if (PROMPTS.length === 0) {
    throw new Error('No spectrum prompts defined in prompts.js');
  }

  if (PROMPTS.length === 1) {
    return { index: 0, prompt: PROMPTS[0] };
  }

  let index;
  do {
    index = Math.floor(Math.random() * PROMPTS.length);
  } while (index === excludeIndex);

  return { index, prompt: PROMPTS[index] };
}
