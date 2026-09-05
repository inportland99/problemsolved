// CACHE-BUSTING: see the comment in board.js. Bump this "?v=N" alongside
// every other one in this feature whenever any wavelength JS file changes.
import { decodeRound } from './round.js?v=5';
import { bandRanges } from './scoring.js?v=5';

/**
 * The clue-giver's phone.
 *
 * Everything it knows arrives in the URL hash of the QR code it just
 * scanned — there is no network call and nothing to keep in sync. When the
 * board moves to a new round it draws a new QR code; scan again.
 *
 * Deliberately shows no needle, so the clue giver can't watch the team's
 * guess and react to it.
 */
export function initClue(root) {
  const round = decodeRound(window.location.hash);

  const empty = root.querySelector('#wl-clue-empty');
  const card = root.querySelector('#wl-clue-card');

  if (!round) {
    empty.hidden = false;
    card.hidden = true;
    return;
  }

  empty.hidden = true;
  card.hidden = false;

  root.querySelector('#wl-clue-round').textContent = round.number;
  root.querySelector('#wl-clue-left').textContent = round.left;
  root.querySelector('#wl-clue-right').textContent = round.right;

  renderSpectrum(root.querySelector('#wl-clue-bands'), round.target);
  positionMarker(root.querySelector('#wl-clue-marker'), round.target);

  // "Clue given" simply blurs the target locally, so a glance at the phone
  // partway through the team's discussion gives nothing away.
  const hideButton = root.querySelector('#wl-clue-hide');
  hideButton.addEventListener('click', () => {
    const hidden = root.dataset.hidden === 'true';
    root.dataset.hidden = String(!hidden);
    hideButton.textContent = hidden ? 'CLUE GIVEN' : 'SHOW TARGET AGAIN';
  });
}

function renderSpectrum(container, target) {
  container.replaceChildren();

  for (const segment of bandRanges(target)) {
    const band = document.createElement('div');
    band.className = `wl-clue-band wl-clue-band--${segment.points}`;
    band.style.left = `${segment.from * 100}%`;
    band.style.width = `${(segment.to - segment.from) * 100}%`;
    band.textContent = segment.points;
    container.appendChild(band);
  }
}

function positionMarker(marker, target) {
  marker.style.left = `${target * 100}%`;
}
