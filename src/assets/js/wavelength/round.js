// CACHE-BUSTING: see the comment in board.js. Bump this "?v=N" alongside
// every other one in this feature whenever any wavelength JS file changes.
import { pickPrompt } from './prompts.js?v=5';
import { randomTarget } from './scoring.js?v=5';

/**
 * A round is the complete, self-contained description of what is being
 * played right now:
 *
 *   { number, left, right, target, promptIndex }
 *
 * The board holds one of these in memory. The phone receives one by
 * decoding it out of the URL hash of the QR code — there is no server
 * and no shared state beyond that hash.
 */

/**
 * Build the next round.
 * @param {number} [previousNumber] round number just played
 * @param {number} [previousPromptIndex] prompt index just used, to avoid repeats
 */
export function newRound(previousNumber = 0, previousPromptIndex = undefined) {
  const { index, prompt } = pickPrompt(previousPromptIndex);

  return {
    number: previousNumber + 1,
    left: prompt.left,
    right: prompt.right,
    target: randomTarget(),
    promptIndex: index,
  };
}

/** Re-roll only the target, keeping the same spectrum and round number. */
export function rerollTarget(round) {
  return { ...round, target: randomTarget() };
}

/**
 * Encode a round into a compact URL hash fragment:
 *
 *   3,Worthless,Priceless,0.4213
 *
 * The delimiter is a comma, not a pipe: "|" is not a legal URL character
 * (RFC 3986), so phone camera apps and QR readers often "fix" it by
 * percent-encoding it to "%7C" before handing the link to the browser.
 * That silently broke decoding here, since a literal "|" split no longer
 * matched. A comma is a valid sub-delimiter that can appear unescaped in a
 * URL fragment, and `encodeURIComponent` always escapes it in the labels
 * below, so it can never collide with label content either.
 *
 * Kept short deliberately: the whole thing has to fit in a QR code that
 * people scan from across a room.
 */
export function encodeRound(round) {
  return [
    round.number,
    encodeURIComponent(round.left),
    encodeURIComponent(round.right),
    round.target.toFixed(4),
  ].join(',');
}

/**
 * Decode a round from a URL hash fragment. Returns null if the hash is
 * missing or malformed, so callers can show a friendly message.
 * @param {string} hash with or without a leading "#"
 */
export function decodeRound(hash) {
  if (!hash) return null;

  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!raw) return null;

  const parts = raw.split(',');
  if (parts.length !== 4) return null;

  const number = Number.parseInt(parts[0], 10);
  const target = Number.parseFloat(parts[3]);

  if (!Number.isFinite(number) || !Number.isFinite(target)) return null;
  if (target < 0 || target > 1) return null;

  try {
    return {
      number,
      left: decodeURIComponent(parts[1]),
      right: decodeURIComponent(parts[2]),
      target,
    };
  } catch {
    // Malformed percent-encoding.
    return null;
  }
}

/** Absolute URL the QR code should point at for a given round. */
export function clueUrlForRound(round, origin = window.location.origin) {
  return `${origin}/personal/wavelength/clue/#${encodeRound(round)}`;
}
