/**
 * Geometry for the semicircular dial.
 *
 * The gauge is drawn in a fixed SVG user-space coordinate system and then
 * scaled to fit the screen by the viewBox, so nothing here depends on the
 * actual pixel size of the display.
 *
 * Position 0.0 is the far left of the arc, 0.5 is straight up, 1.0 is the
 * far right:  angle = -90 + position * 180  (degrees, clockwise positive)
 */

export const GAUGE = {
  cx: 500,
  cy: 500,
  rOuter: 460,
  rInner: 330,
  // A little headroom below the pivot so the hub isn't flush with the edge.
  // The spectrum labels sit outside the SVG, beside the dial.
  viewBox: '0 0 1000 560',
};

/** Convert a 0..1 position to a rotation in degrees, 0deg being straight up. */
export function positionToAngle(position) {
  return -90 + position * 180;
}

/**
 * Cartesian point on the arc at a given radius and position.
 * @returns {{x: number, y: number}}
 */
export function pointOnArc(radius, position) {
  const radians = (positionToAngle(position) * Math.PI) / 180;
  return {
    x: GAUGE.cx + radius * Math.sin(radians),
    y: GAUGE.cy - radius * Math.cos(radians),
  };
}

/**
 * An open arc path at a single radius, for stroked tracks and tick rings.
 */
export function arcPath(radius, fromPosition, toPosition) {
  const start = pointOnArc(radius, fromPosition);
  const end = pointOnArc(radius, toPosition);
  const largeArc = Math.abs(toPosition - fromPosition) > 0.5 ? 1 : 0;

  return [
    `M ${start.x.toFixed(2)} ${start.y.toFixed(2)}`,
    `A ${radius} ${radius} 0 ${largeArc} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`,
  ].join(' ');
}

/**
 * A closed annular sector — the wedge shape used for each scoring band.
 * Sweeps outward along rOuter then back along rInner.
 */
export function bandArcPath(fromPosition, toPosition, rInner = GAUGE.rInner, rOuter = GAUGE.rOuter) {
  const outerStart = pointOnArc(rOuter, fromPosition);
  const outerEnd = pointOnArc(rOuter, toPosition);
  const innerEnd = pointOnArc(rInner, toPosition);
  const innerStart = pointOnArc(rInner, fromPosition);
  const largeArc = Math.abs(toPosition - fromPosition) > 0.5 ? 1 : 0;

  return [
    `M ${outerStart.x.toFixed(2)} ${outerStart.y.toFixed(2)}`,
    `A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${outerEnd.x.toFixed(2)} ${outerEnd.y.toFixed(2)}`,
    `L ${innerEnd.x.toFixed(2)} ${innerEnd.y.toFixed(2)}`,
    `A ${rInner} ${rInner} 0 ${largeArc} 0 ${innerStart.x.toFixed(2)} ${innerStart.y.toFixed(2)}`,
    'Z',
  ].join(' ');
}

/** Midpoint of a band, at the radius where its point value label sits. */
export function bandLabelPoint(fromPosition, toPosition) {
  return pointOnArc((GAUGE.rInner + GAUGE.rOuter) / 2, (fromPosition + toPosition) / 2);
}
