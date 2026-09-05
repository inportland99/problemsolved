/**
 * Wavelength scoring — pure functions only. No DOM, no side effects.
 *
 * Every position in this game is a normalized number from 0.0 (far left)
 * to 1.0 (far right). Nothing here knows about pixels or angles.
 */

/**
 * Scoring bands, expressed as the distance from the target center at which
 * each band ends. Together they form the classic 2 | 3 | 4 | 3 | 2 strip:
 *
 *   4 points: the middle 4%  of the spectrum (0.02 either side of center)
 *   3 points: the next  4%   on each side
 *   2 points: the next  6%   on each side
 *   0 points: everywhere else
 *
 * Narrower than a standard Wavelength board on purpose — the whole scoring
 * area is 24% of the spectrum instead of 34%, making the needle harder to
 * land. Tune the three `maxDistance` values directly to make it easier or
 * harder; everything else (rendering, target placement, scoring) derives
 * from these three numbers automatically.
 */
export const BANDS = [
  { points: 4, maxDistance: 0.02 },
  { points: 3, maxDistance: 0.06 },
  { points: 2, maxDistance: 0.12 },
];

/** Half the total width of the scoring area (0.12 => 24% of the spectrum). */
export const TARGET_HALF_WIDTH = BANDS[BANDS.length - 1].maxDistance;

/** Clamp a value into the 0..1 playable range. */
export function clampPosition(position) {
  return Math.min(1, Math.max(0, position));
}

/**
 * Score the needle against the target.
 * @param {number} needlePosition 0..1
 * @param {number} targetPosition 0..1
 * @returns {number} 0, 2, 3, or 4
 */
export function calculateScore(needlePosition, targetPosition) {
  const distance = Math.abs(needlePosition - targetPosition);

  for (const band of BANDS) {
    if (distance <= band.maxDistance) {
      return band.points;
    }
  }

  return 0;
}

/**
 * The scoring area as a left-to-right list of segments, for rendering.
 * Always returns five segments: 2 | 3 | 4 | 3 | 2.
 *
 * @param {number} targetPosition 0..1
 * @returns {Array<{points: number, from: number, to: number}>}
 */
export function bandRanges(targetPosition) {
  const edges = BANDS.map((band) => band.maxDistance);
  const segments = [];

  // Left half, widest band first, working inward toward the center.
  for (let i = edges.length - 1; i > 0; i--) {
    segments.push({
      points: BANDS[i].points,
      from: targetPosition - edges[i],
      to: targetPosition - edges[i - 1],
    });
  }

  // The 4-point band straddles the center.
  segments.push({
    points: BANDS[0].points,
    from: targetPosition - edges[0],
    to: targetPosition + edges[0],
  });

  // Right half, working back outward.
  for (let i = 1; i < edges.length; i++) {
    segments.push({
      points: BANDS[i].points,
      from: targetPosition + edges[i - 1],
      to: targetPosition + edges[i],
    });
  }

  return segments;
}

/**
 * A random target center, constrained so the entire scoring area stays
 * within the playable range (nothing runs off the edge of the dial).
 * @returns {number} 0.17..0.83
 */
export function randomTarget() {
  const span = 1 - TARGET_HALF_WIDTH * 2;
  return TARGET_HALF_WIDTH + Math.random() * span;
}
