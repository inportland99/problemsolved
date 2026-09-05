// CACHE-BUSTING: GitHub Pages serves these files with Cache-Control:
// max-age=600 and this project has no bundler/hashed filenames. Static
// `import` specifiers must be string literals, so bumping a shared constant
// isn't possible — whenever ANY file under assets/js/wavelength/ changes,
// bump this "?v=N" suffix on EVERY import below, in clue.js, in round.js,
// and on the <script type="module" src="..."> tags in wavelength.njk and
// wavelength-clue.njk. Otherwise phones that already cached the old module
// keep running stale code after a deploy (this bit us once: a decoder fix
// shipped, but a phone's cached copy of round.js still ran the old logic).
import { GAUGE, bandArcPath, bandLabelPoint, pointOnArc, positionToAngle } from './gauge.js?v=4';
import { newRound, rerollTarget, clueUrlForRound } from './round.js?v=4';
import { bandRanges, calculateScore, clampPosition } from './scoring.js?v=4';
import { renderQr } from './qr.js?v=4';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** How far a single tap of an arrow key moves the needle. */
const STEP = 0.01;
const FINE_STEP = 0.002;

/** Held-key glide: how long before it kicks in, and how fast it runs. */
const HOLD_DELAY_MS = 220;
const GLIDE_PER_SECOND = 0.42;
const FINE_GLIDE_PER_SECOND = 0.1;

/** Higher = the rendered needle catches up to its true position faster. */
const SMOOTHING = 18;

export function initBoard(root) {
  const el = {
    round: root.querySelector('#wl-round'),
    leftLabel: root.querySelector('#wl-left-label'),
    rightLabel: root.querySelector('#wl-right-label'),
    gauge: root.querySelector('#wl-gauge'),
    track: root.querySelector('#wl-track'),
    ticks: root.querySelector('#wl-ticks'),
    bands: root.querySelector('#wl-bands'),
    bandsContent: root.querySelector('#wl-bands-content'),
    targetLine: root.querySelector('#wl-target-line'),
    needle: root.querySelector('#wl-needle'),
    score: root.querySelector('#wl-score'),
    scoreText: root.querySelector('#wl-score-text'),
    scoreBg: root.querySelector('#wl-score-bg'),
    qr: root.querySelector('#wl-qr'),
    qrPanel: root.querySelector('#wl-qr-panel'),
  };

  const state = {
    round: newRound(),
    /** True needle position, what we score against. */
    needle: 0.5,
    /** Rendered needle position, eased toward `needle`. */
    displayNeedle: 0.5,
    revealed: false,
    score: null,
    held: { direction: 0, fine: false, startedAt: 0 },
  };

  drawStaticGauge(el);

  // ─── Rendering ────────────────────────────────────────────────────────

  function renderRound() {
    el.round.textContent = state.round.number;
    el.leftLabel.textContent = state.round.left;
    el.rightLabel.textContent = state.round.right;
    root.dataset.revealed = String(state.revealed);
  }

  function renderNeedle() {
    el.needle.style.transform = `rotate(${positionToAngle(state.displayNeedle).toFixed(3)}deg)`;
  }

  function renderBands() {
    el.bandsContent.replaceChildren();

    for (const segment of bandRanges(state.round.target)) {
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', bandArcPath(segment.from, segment.to));
      path.setAttribute('class', `wl-band wl-band--${segment.points}`);
      el.bandsContent.appendChild(path);

      const { x, y } = bandLabelPoint(segment.from, segment.to);
      const label = document.createElementNS(SVG_NS, 'text');
      label.setAttribute('class', 'wl-band-label');
      label.setAttribute('x', x.toFixed(2));
      label.setAttribute('y', y.toFixed(2));
      label.textContent = segment.points;
      el.bandsContent.appendChild(label);
    }

    const inner = pointOnArc(GAUGE.rInner - 14, state.round.target);
    const outer = pointOnArc(GAUGE.rOuter + 14, state.round.target);
    el.targetLine.setAttribute('x1', inner.x.toFixed(2));
    el.targetLine.setAttribute('y1', inner.y.toFixed(2));
    el.targetLine.setAttribute('x2', outer.x.toFixed(2));
    el.targetLine.setAttribute('y2', outer.y.toFixed(2));
  }

  function renderScore() {
    if (state.score === null) {
      el.scoreText.textContent = '';
      el.scoreBg.setAttribute('width', '0');
      el.scoreBg.setAttribute('height', '0');
      return;
    }

    el.scoreText.textContent = state.score === 0 ? 'MISSED IT' : `${state.score} POINTS!`;

    // Size the backing pill to whatever the text turned out to be, so the
    // score stays readable even when the needle is pointing right through it.
    const box = el.scoreText.getBBox();
    const padX = 40;
    const padY = 18;
    el.scoreBg.setAttribute('x', (box.x - padX).toFixed(2));
    el.scoreBg.setAttribute('y', (box.y - padY).toFixed(2));
    el.scoreBg.setAttribute('width', (box.width + padX * 2).toFixed(2));
    el.scoreBg.setAttribute('height', (box.height + padY * 2).toFixed(2));
    el.scoreBg.setAttribute('rx', ((box.height + padY * 2) / 2).toFixed(2));
  }

  async function refreshQr() {
    await renderQr(el.qr, clueUrlForRound(state.round));
  }

  // ─── Actions ──────────────────────────────────────────────────────────

  function moveNeedle(delta) {
    if (state.revealed) return;
    state.needle = clampPosition(state.needle + delta);
  }

  function reveal() {
    if (state.revealed) return;

    state.revealed = true;
    state.score = calculateScore(state.needle, state.round.target);
    state.held.direction = 0;

    renderBands();
    renderScore();
    root.dataset.revealed = 'true';

    // Restart the CSS animations from the top.
    el.bands.classList.remove('is-revealed');
    el.score.classList.remove('is-revealed');
    void el.bands.offsetWidth;
    el.bands.classList.add('is-revealed');
    el.score.classList.add('is-revealed');
  }

  function nextRound() {
    state.round = newRound(state.round.number, state.round.promptIndex);
    state.needle = 0.5;
    state.displayNeedle = 0.5;
    state.revealed = false;
    state.score = null;
    state.held.direction = 0;

    el.bands.classList.remove('is-revealed');
    el.score.classList.remove('is-revealed');
    el.bandsContent.replaceChildren();

    renderRound();
    renderScore();
    renderNeedle();
    refreshQr();
  }

  function reroll() {
    if (state.revealed) return;
    state.round = rerollTarget(state.round);
    refreshQr();
  }

  function toggleFullscreen() {
    if (!document.fullscreenEnabled) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  }

  // ─── Animation loop ───────────────────────────────────────────────────

  let lastFrame = performance.now();

  function frame(now) {
    const dt = Math.min((now - lastFrame) / 1000, 0.05);
    lastFrame = now;

    const held = state.held;
    if (held.direction !== 0 && now - held.startedAt > HOLD_DELAY_MS) {
      const rate = held.fine ? FINE_GLIDE_PER_SECOND : GLIDE_PER_SECOND;
      moveNeedle(held.direction * rate * dt);
    }

    const difference = state.needle - state.displayNeedle;
    if (Math.abs(difference) > 0.00005) {
      state.displayNeedle += difference * Math.min(1, dt * SMOOTHING);
      renderNeedle();
    } else if (state.displayNeedle !== state.needle) {
      state.displayNeedle = state.needle;
      renderNeedle();
    }

    requestAnimationFrame(frame);
  }

  // ─── Input ────────────────────────────────────────────────────────────

  function startHold(direction, fine) {
    if (state.revealed) return;
    if (state.held.direction === direction && state.held.fine === fine) return;
    state.held = { direction, fine, startedAt: performance.now() };
    moveNeedle(direction * (fine ? FINE_STEP : STEP));
  }

  function endHold(direction) {
    if (state.held.direction === direction) {
      state.held.direction = 0;
    }
  }

  function onKeyDown(event) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;

    switch (event.key) {
      case 'ArrowLeft':
      case 'PageUp':
        event.preventDefault();
        if (!event.repeat) startHold(-1, event.shiftKey);
        break;

      case 'ArrowRight':
      case 'PageDown':
        event.preventDefault();
        if (!event.repeat) startHold(1, event.shiftKey);
        break;

      case ' ':
      case 'Spacebar':
      case 'Enter':
        event.preventDefault();
        reveal();
        break;

      default:
        if (event.repeat) return;

        switch (event.key.toLowerCase()) {
          case 'n':
            event.preventDefault();
            nextRound();
            break;
          case 'r':
            event.preventDefault();
            reroll();
            break;
          case 'f':
            event.preventDefault();
            toggleFullscreen();
            break;
          case 'q':
            event.preventDefault();
            el.qrPanel.classList.toggle('is-large');
            break;
          default:
            break;
        }
    }
  }

  function onKeyUp(event) {
    if (event.key === 'ArrowLeft' || event.key === 'PageUp') endHold(-1);
    if (event.key === 'ArrowRight' || event.key === 'PageDown') endHold(1);
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', () => {
    state.held.direction = 0;
  });

  // Backup on-screen controls for mouse / trackpad.
  bindHoldButton(root.querySelector('#wl-btn-left'), () => startHold(-1, false), () => endHold(-1));
  bindHoldButton(root.querySelector('#wl-btn-right'), () => startHold(1, false), () => endHold(1));
  root.querySelector('#wl-btn-reveal').addEventListener('click', reveal);
  root.querySelector('#wl-btn-next').addEventListener('click', nextRound);
  el.qrPanel.addEventListener('click', () => el.qrPanel.classList.toggle('is-large'));

  // ─── Go ───────────────────────────────────────────────────────────────

  renderRound();
  renderNeedle();
  renderScore();
  refreshQr();
  requestAnimationFrame(frame);
}

function bindHoldButton(button, onStart, onEnd) {
  button.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    onStart();
  });
  button.addEventListener('pointerup', onEnd);
  button.addEventListener('pointercancel', onEnd);
  button.addEventListener('pointerleave', onEnd);
}

/** Draw the pieces of the dial that never change: the track and the ticks. */
function drawStaticGauge(el) {
  el.gauge.setAttribute('viewBox', GAUGE.viewBox);
  el.track.setAttribute('d', bandArcPath(0, 1));

  el.ticks.replaceChildren();
  for (let i = 0; i <= 20; i++) {
    const position = i / 20;
    const major = i % 5 === 0;
    const from = pointOnArc(GAUGE.rOuter - (major ? 30 : 16), position);
    const to = pointOnArc(GAUGE.rOuter, position);

    const tick = document.createElementNS(SVG_NS, 'line');
    tick.setAttribute('class', major ? 'wl-tick wl-tick--major' : 'wl-tick');
    tick.setAttribute('x1', from.x.toFixed(2));
    tick.setAttribute('y1', from.y.toFixed(2));
    tick.setAttribute('x2', to.x.toFixed(2));
    tick.setAttribute('y2', to.y.toFixed(2));
    el.ticks.appendChild(tick);
  }
}
