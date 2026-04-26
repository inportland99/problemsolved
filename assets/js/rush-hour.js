/**
 * Rush Hour – Daily Sliding Block Puzzle
 *
 * Board conventions
 *  - 6×6 grid, cells addressed as (row, col) starting at (0,0) top-left
 *  - EXIT is on the RIGHT wall of row 2 (0-indexed), the target car exits right
 *  - Vehicles: { id, row, col, length, dir: 'H'|'V', color, isTarget }
 *    col/row = top-left cell of the vehicle
 */
(function () {
  'use strict';

  // ─── Constants ────────────────────────────────────────────────────────────
  const GRID        = 6;
  const EXIT_ROW    = 2;          // row 2, 0-indexed (third row from top)
  const STORAGE_KEY = 'rush-hour-state';
  const STATS_KEY   = 'rush-hour-stats';

  // ─── Vehicle colour palette (not used for target car) ────────────────────
  const COLORS = [
    '#3B82F6', // blue
    '#10B981', // emerald
    '#F59E0B', // amber
    '#8B5CF6', // violet
    '#EC4899', // pink
    '#14B8A6', // teal
    '#F97316', // orange
    '#6366F1', // indigo
    '#84CC16', // lime
    '#06B6D4', // cyan
    '#A855F7', // purple
  ];

  // ─── Puzzle library ─────────────────────────────────────────────────────────
  // Built-in tutorial puzzles always come first (gentle onboarding).
  // Generated puzzles from src/_data/rushHourPuzzles.json are appended at
  // runtime via window.RUSH_HOUR_PUZZLES (see rush-hour.njk).
  const BUILTIN_PUZZLES = [
    // ── Puzzle 0 – "Beginner" ── easy ~5 moves ──────────────────────
    // Grid (. = empty, T = target, letters = other cars):
    //   . . . . . .
    //   . . B . . .
    //   T T B . . .
    //   . . . C C .
    //   . . . . . .
    //   . . . . . .
    [
      { id:'T', row:2, col:0, length:2, dir:'H', isTarget:true  },
      { id:'B', row:1, col:2, length:2, dir:'V', isTarget:false },
      { id:'C', row:3, col:3, length:2, dir:'H', isTarget:false },
    ],

    // ── Puzzle 1 – "Easy" ── ~7 moves ─────────────────────────
    // . . . . . .   row 0
    // . . . B . .   row 1  B = V len 3 (rows 1-3, col 3)
    // T T A B . .   row 2  A = V len 2 (rows 2-3, col 2)
    // . . A B . .   row 3
    // . . . . . .   row 4
    // . . . . . .   row 5
    // Solution: A↓1  B↓2  T→4
    [
      { id:'T', row:2, col:0, length:2, dir:'H', isTarget:true  },
      { id:'A', row:2, col:2, length:2, dir:'V', isTarget:false },
      { id:'B', row:1, col:3, length:3, dir:'V', isTarget:false },
    ],

    // ── Puzzle 2 – "Medium" ── ~8 moves ──────────────────────
    // . . . C C .   row 0  C = H len 2 (row 0, cols 3-4)
    // . . . A . .   row 1  A = V len 2 (rows 1-2, col 3)
    // . T T A B .   row 2  B = V len 2 (rows 2-3, col 4)
    // . . . . B .   row 3
    // . . . . D D   row 4  D = H len 2 (row 4, cols 4-5)
    // . . . . . .   row 5
    // Solution: C←2  A↑1  B↑2  T→3
    [
      { id:'T', row:2, col:1, length:2, dir:'H', isTarget:true  },
      { id:'A', row:1, col:3, length:2, dir:'V', isTarget:false },
      { id:'B', row:2, col:4, length:2, dir:'V', isTarget:false },
      { id:'C', row:0, col:3, length:2, dir:'H', isTarget:false },
      { id:'D', row:4, col:4, length:2, dir:'H', isTarget:false },
    ],
  ];

  // Per-puzzle metadata (parallel to PUZZLES). Holds the optimal solve length
  // (minMoves / par). Built-in tutorials use the documented values from their
  // header comments; generated puzzles use the BFS-computed minMoves.
  const BUILTIN_META = [
    { minMoves: 5 },
    { minMoves: 7 },
    { minMoves: 8 },
  ];

  /**
   * Build the runtime PUZZLES + PUZZLE_META arrays.
   *   - Always prefix the built-in tutorial puzzles.
   *   - Append generated puzzles from window.RUSH_HOUR_PUZZLES, in difficulty
   *     order: easy → moderate → hard → expert.
   *   - Accept either a raw vehicles array or { vehicles, minMoves, ... }.
   *   - If the data is missing or empty, just use the built-ins.
   */
  function loadPuzzles() {
    const data = (typeof window !== 'undefined' && window.RUSH_HOUR_PUZZLES) || null;
    if (!data) {
      return { puzzles: BUILTIN_PUZZLES.slice(), meta: BUILTIN_META.slice() };
    }
    const order = ['easy', 'moderate', 'hard', 'expert'];
    const generated = [];
    const generatedMeta = [];
    for (const k of order) {
      const arr = Array.isArray(data[k]) ? data[k] : [];
      for (const entry of arr) {
        if (Array.isArray(entry)) {
          generated.push(entry);
          generatedMeta.push({ minMoves: null });
        } else if (entry && Array.isArray(entry.vehicles)) {
          generated.push(entry.vehicles);
          generatedMeta.push({
            minMoves: typeof entry.minMoves === 'number' ? entry.minMoves : null,
          });
        }
      }
    }
    if (generated.length === 0) {
      return { puzzles: BUILTIN_PUZZLES.slice(), meta: BUILTIN_META.slice() };
    }
    return {
      puzzles: BUILTIN_PUZZLES.concat(generated),
      meta:    BUILTIN_META.concat(generatedMeta),
    };
  }

  const { puzzles: PUZZLES, meta: PUZZLE_META } = loadPuzzles();

  // ─── State ────────────────────────────────────────────────────────────────
  let puzzleIndex  = 0;         // which puzzle (will rotate daily)
  let vehicles     = [];        // current mutable vehicle positions
  let initialState = [];        // deep copy for reset
  let selected     = null;      // id of selected vehicle
  let moves        = 0;
  let solved       = false;
  let puzzleNumber = 0;

  // Timer
  let timerInterval = null;
  let elapsed       = 0;
  let isPaused      = false;
  let startTime     = null;

  // ─── Helpers ──────────────────────────────────────────────────────────────
  function deepCopy(arr) {
    return arr.map(v => ({ ...v }));
  }

  function getDaysSinceEpoch() {
    const epoch = new Date('2024-01-01').getTime();
    return Math.floor((Date.now() - epoch) / 86400000);
  }

  function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  // ─── Board geometry ───────────────────────────────────────────────────────
  /** Return the CSS `--cell` value in px from the board element */
  function cellPx() {
    const board = document.getElementById('rush-hour-board');
    return parseFloat(getComputedStyle(board).getPropertyValue('--cell')) || 72;
  }

  function gapPx() {
    const board = document.getElementById('rush-hour-board');
    return parseFloat(getComputedStyle(board).getPropertyValue('--gap')) || 4;
  }

  /** Convert grid (row, col) to pixel top/left inside the board */
  function toPixel(rowOrCol) {
    const c = cellPx(), g = gapPx();
    return rowOrCol * (c + g);
  }

  // ─── Collision detection ──────────────────────────────────────────────────
  /** Build a 6×6 occupancy grid mapping cell → vehicle id (or null) */
  function buildOccupancy(vList) {
    const occ = Array.from({ length: GRID }, () => Array(GRID).fill(null));
    for (const v of vList) {
      for (let i = 0; i < v.length; i++) {
        const r = v.dir === 'V' ? v.row + i : v.row;
        const c = v.dir === 'H' ? v.col + i : v.col;
        if (r >= 0 && r < GRID && c >= 0 && c < GRID) occ[r][c] = v.id;
      }
    }
    return occ;
  }

  /** How many steps can vehicle `v` move in direction `delta` (+1/-1)?  */
  function maxMoves(v, delta, occ) {
    let steps = 0;
    while (true) {
      const nextRow = v.dir === 'V' ? v.row + delta * (steps + 1) : v.row;
      const nextCol = v.dir === 'H' ? v.col + delta * (steps + 1) : v.col;

      // Leading edge cell to check
      const checkRow = v.dir === 'V' ? (delta > 0 ? nextRow + v.length - 1 : nextRow) : v.row;
      const checkCol = v.dir === 'H' ? (delta > 0 ? nextCol + v.length - 1 : nextCol) : v.col;

      // Out of bounds?
      if (checkRow < 0 || checkRow >= GRID || checkCol < 0 || checkCol >= GRID) break;
      // Occupied by another vehicle?
      if (occ[checkRow][checkCol] !== null && occ[checkRow][checkCol] !== v.id) break;

      steps++;
    }
    return steps;
  }

  // ─── Move execution ───────────────────────────────────────────────────────
  function tryMove(id, delta) {
    if (solved || isPaused) return;
    const v   = vehicles.find(x => x.id === id);
    if (!v) return;

    const occ   = buildOccupancy(vehicles);
    const steps = maxMoves(v, delta, occ);
    if (steps === 0) {
      flashVehicle(id);
      return;
    }

    if (v.dir === 'H') v.col += delta;
    else               v.row += delta;

    moves++;
    renderBoard();
    updateMoveCounter();
    checkWin();
    // Save AFTER checkWin so solved=true is persisted on the winning move.
    // Otherwise a refresh would restore solved=false and let the player keep moving.
    saveState();
  }

  // ─── Win detection ────────────────────────────────────────────────────────
  function checkWin() {
    if (solved) return;
    const target = vehicles.find(v => v.isTarget);
    // Win when the right edge of the target car reaches column 5 (last col)
    if (target && target.col + target.length - 1 >= GRID - 1) {
      triggerWin();
    }
  }

  function triggerWin() {
    if (solved) return;   // guard against duplicate calls
    solved = true;
    stopTimer();
    confetti({ particleCount: 160, spread: 80, origin: { y: 0.55 } });

    // Show win overlay
    const overlay = document.getElementById('win-overlay');
    overlay.querySelector('#win-moves').textContent = moves;
    overlay.querySelector('#win-time').textContent  = formatTime(elapsed);
    setWinPar(overlay);
    overlay.classList.add('visible');

    // Show share button
    document.getElementById('share-btn').style.display = 'inline-flex';

    // Update stats
    updateStats(true);
    updateStatsDisplay();

    // Persist the solved state so a refresh keeps the game locked.
    saveState();
  }

  // ─── Rendering ────────────────────────────────────────────────────────────
  function renderBoard() {
    const board    = document.getElementById('rush-hour-board');
    board.querySelectorAll('.vehicle').forEach(el => el.remove());

    const c        = cellPx();
    const g        = gapPx();
    const colorMap = buildColorMap();
    const occ      = buildOccupancy(vehicles);  // computed once for all arrow states

    for (const v of vehicles) {
      const el = document.createElement('div');
      el.className = 'vehicle ' + (v.dir === 'H' ? 'dir-h' : 'dir-v')
                   + (v.length === 3 ? ' truck' : '')
                   + (v.isTarget  ? ' target-car' : '')
                   + (selected === v.id ? ' selected' : '');
      el.dataset.id = v.id;
      // Headlight direction. Target car always faces the exit (right).
      // Other cars: honor per-vehicle `front` ('pos' or 'neg') if set,
      // otherwise default to 'pos' (right for H, down for V).
      el.dataset.front = v.isTarget ? 'pos' : (v.front === 'neg' ? 'neg' : 'pos');

      el.style.top    = toPixel(v.row) + 'px';
      el.style.left   = toPixel(v.col) + 'px';
      el.style.width  = (v.dir === 'H' ? v.length * c + (v.length - 1) * g : c) + 'px';
      el.style.height = (v.dir === 'V' ? v.length * c + (v.length - 1) * g : c) + 'px';
      if (!v.isTarget) el.style.setProperty('--car-color', colorMap[v.id]);

      // Windshield overlay: a translucent white div clipped to a per-orientation
      // SVG mask. The SVG defines the windshield silhouette; CSS picks the
      // right mask file via the .dir-h/.dir-v + .truck class combination.
      const windshield = document.createElement('div');
      windshield.className = 'windshield';
      el.appendChild(windshield);

      // End arrows
      const negSym = v.dir === 'H' ? '◀' : '▲';
      const posSym = v.dir === 'H' ? '▶' : '▼';
      el.appendChild(makeVehicleArrow(negSym, maxMoves(v, -1, occ) > 0, v.id, -1));
      el.appendChild(makeVehicleArrow(posSym, maxMoves(v, +1, occ) > 0, v.id, +1));

      // Click on the vehicle body (not an arrow) toggles keyboard selection
      el.addEventListener('click', (e) => {
        if (e.target.closest('.vehicle-arrow') || solved) return;
        selected = (selected === v.id) ? null : v.id;
        renderBoard();
      });

      board.appendChild(el);
    }
  }

  /** Create a small arrow button for one end of a vehicle */
  function makeVehicleArrow(symbol, canMove, id, delta) {
    const btn = document.createElement('button');
    btn.className    = 'vehicle-arrow';
    btn.textContent  = symbol;
    btn.disabled     = !canMove;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();   // don't fire the vehicle-body click
      tryMove(id, delta);
    });
    return btn;
  }

  function buildColorMap() {
    const map = {};
    let ci = 0;
    for (const v of vehicles) {
      if (!v.isTarget) map[v.id] = COLORS[ci++ % COLORS.length];
    }
    return map;
  }

  // ─── (drag system removed – vehicles use end-arrow buttons instead) ──────
  function initDragListeners() {  // kept as no-op so old call in init is harmless
    const board = document.getElementById('rush-hour-board');

    // ── Pointer down: select vehicle and start drag ──────────────────────
    // no-op: drag replaced by per-vehicle arrow buttons
  }


  // ─── Keyboard input ───────────────────────────────────────────────────────
  document.addEventListener('keydown', (e) => {
    if (!selected || solved || isPaused) return;
    const v = vehicles.find(x => x.id === selected);
    if (!v) return;

    if (e.key === 'ArrowLeft'  && v.dir === 'H') { e.preventDefault(); tryMove(selected, -1); }
    if (e.key === 'ArrowRight' && v.dir === 'H') { e.preventDefault(); tryMove(selected, +1); }
    if (e.key === 'ArrowUp'    && v.dir === 'V') { e.preventDefault(); tryMove(selected, -1); }
    if (e.key === 'ArrowDown'  && v.dir === 'V') { e.preventDefault(); tryMove(selected, +1); }
    if (e.key === 'Escape') { selected = null; renderBoard(); }
  });

  // ─── Visual flash on blocked move ─────────────────────────────────────────
  function flashVehicle(id) {
    const el = document.querySelector(`.vehicle[data-id="${id}"]`);
    if (el) {
      el.style.outline = '3px solid #ef4444';
      setTimeout(() => el.style.outline = '', 300);
    }
  }

  // ─── Timer ────────────────────────────────────────────────────────────────
  function startTimer() {
    if (timerInterval) return;
    startTime = Date.now() - elapsed * 1000;
    timerInterval = setInterval(() => {
      elapsed = Math.floor((Date.now() - startTime) / 1000);
      document.getElementById('timer').textContent = ' ' + formatTime(elapsed);
    }, 500);
  }

  function stopTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  function pauseTimer() {
    if (isPaused) return;
    isPaused = true;
    stopTimer();
  }

  function resumeTimer() {
    if (!isPaused) return;
    isPaused = false;
    startTimer();
  }

  // ─── Move counter ─────────────────────────────────────────────────────────
  function updateMoveCounter() {
    document.getElementById('move-counter').textContent = `${moves} move${moves !== 1 ? 's' : ''}`;
  }

  // ─── localStorage ─────────────────────────────────────────────────────────
  function saveState() {
    const state = { puzzleNumber, vehicles, moves, elapsed, solved };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch { return null; }
  }

  // ─── Stats ────────────────────────────────────────────────────────────────
  function loadStats() {
    try {
      return JSON.parse(localStorage.getItem(STATS_KEY)) || defaultStats();
    } catch { return defaultStats(); }
  }

  function defaultStats() {
    return { played: 0, currentStreak: 0, maxStreak: 0, bestMoves: null, totalMoves: 0, bestTime: null, totalTime: 0, lastSolvedDay: null };
  }

  function updateStats(win) {
    if (!win) return;
    const stats = loadStats();
    const day   = getDaysSinceEpoch();

    stats.played++;
    if (stats.lastSolvedDay === day - 1) {
      stats.currentStreak++;
    } else if (stats.lastSolvedDay !== day) {
      stats.currentStreak = 1;
    }
    stats.maxStreak     = Math.max(stats.maxStreak, stats.currentStreak);
    stats.lastSolvedDay = day;

    // Moves stats
    if (stats.bestMoves === null || moves < stats.bestMoves) stats.bestMoves = moves;
    stats.totalMoves += moves;

    // Time stats
    if (stats.bestTime === null || elapsed < stats.bestTime) stats.bestTime = elapsed;
    stats.totalTime += elapsed;

    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  }

  function updateStatsDisplay() {
    const stats  = loadStats();
    const avgMov = stats.played > 0 ? Math.round(stats.totalMoves / stats.played) : '--';
    const avgTim = stats.played > 0 ? formatTime(Math.round(stats.totalTime / stats.played)) : '--';

    document.getElementById('stat-played').textContent         = stats.played;
    document.getElementById('stat-current-streak').textContent = stats.currentStreak;
    document.getElementById('stat-max-streak').textContent     = stats.maxStreak;
    document.getElementById('stat-best-moves').textContent     = stats.bestMoves ?? '--';
    document.getElementById('stat-avg-moves').textContent      = avgMov;
    document.getElementById('stat-best-time').textContent      = stats.bestTime !== null ? formatTime(stats.bestTime) : '--';
    document.getElementById('stat-avg-time').textContent       = avgTim;

    if (solved) {
      document.getElementById('game-complete-message').style.display = 'block';
      startCountdown();
    }
  }

  function startCountdown() {
    const el = document.getElementById('countdown-timer');
    if (!el) return;
    function tick() {
      const now  = new Date();
      const next = new Date(now);
      next.setHours(24, 0, 0, 0);
      const diff = Math.floor((next - now) / 1000);
      const h = Math.floor(diff / 3600);
      const m = Math.floor((diff % 3600) / 60);
      const s = diff % 60;
      el.textContent = `Next puzzle in ${h}h ${m}m ${s}s`;
    }
    tick();
    setInterval(tick, 1000);
  }

  // ─── Share ────────────────────────────────────────────────────────────────
  function buildShareText() {
    return [
      `🚗 Rush Hour #${puzzleNumber}`,
      `⏱ ${formatTime(elapsed)}  🔢 ${moves} moves`,
      `drrajshah.com/games/rush-hour`,
    ].join('\n');
  }

  function showShareModal() {
    document.getElementById('share-text').textContent = buildShareText();
    showModal('shareModal');
  }

  // ─── Win-overlay par helper ───────────────────────────────────────────
  function setWinPar(overlay) {
    const parLine = overlay.querySelector('#win-par-line');
    const parSpan = overlay.querySelector('#win-par');
    const diffSpan = overlay.querySelector('#win-par-diff');
    if (!parLine || !parSpan) return;
    const meta = PUZZLE_META[puzzleIndex];
    const par = meta && typeof meta.minMoves === 'number' ? meta.minMoves : null;
    if (par === null) {
      parLine.style.display = 'none';
      return;
    }
    parLine.style.display = '';
    parSpan.textContent = par;
    if (diffSpan) {
      const delta = moves - par;
      if (delta <= 0)      diffSpan.textContent = ' — perfect!';
      else if (delta === 1) diffSpan.textContent = ' — 1 move over par';
      else                  diffSpan.textContent = ` — ${delta} moves over par`;
    }
  }

  // ─── Reset ────────────────────────────────────────────────────────────
  function resetPuzzle() {
    vehicles = deepCopy(initialState);
    moves    = 0;
    elapsed  = 0;
    solved   = false;
    selected = null;

    isPaused = false;
    stopTimer();
    startTimer();

    document.getElementById('win-overlay').classList.remove('visible');
    document.getElementById('share-btn').style.display = 'none';

    renderBoard();
    updateMoveCounter();
    saveState();
  }

  // ─── Modal helpers (match existing games pattern) ─────────────────────────
  function showModal(id) {
    const el = document.getElementById(id);
    if (el) { el.classList.remove('hidden'); el.classList.add('flex'); }
  }

  function hideModal(id) {
    const el = document.getElementById(id);
    if (el) { el.classList.add('hidden'); el.classList.remove('flex'); }
  }

  // ─── Initialisation ────────────────────────────────────────────────────────────
  function init() {
    puzzleNumber = getDaysSinceEpoch();

    // ?puzzle=N overrides the daily rotation (for previewing/testing)
    const urlParams   = new URLSearchParams(window.location.search);
    const puzzleParam = urlParams.get('puzzle');
    const previewMode = puzzleParam !== null;
    if (previewMode) {
      puzzleIndex = ((parseInt(puzzleParam, 10) || 0) + PUZZLES.length) % PUZZLES.length;
    } else {
      puzzleIndex = puzzleNumber % PUZZLES.length;
    }
    const def = PUZZLES[puzzleIndex];

    // In preview mode always start fresh; otherwise restore today's saved state
    const saved = previewMode ? null : loadState();
    if (saved && saved.puzzleNumber === puzzleNumber) {
      vehicles = saved.vehicles;
      moves    = saved.moves;
      elapsed  = saved.elapsed;
      solved   = saved.solved;
    } else {
      vehicles = deepCopy(def);
      moves    = 0;
      elapsed  = 0;
      solved   = false;
    }
    initialState = deepCopy(def);    // always keep clean copy for reset

    // Daily number label
    document.getElementById('daily-number').textContent = `🗓️ Puzzle #${puzzleNumber}`;

    renderBoard();
    updateMoveCounter();

    // Timer – start paused until user dismisses welcome
    document.getElementById('timer').textContent = ' ' + formatTime(elapsed);
    if (!solved) {
      pauseTimer();
    }

    // ── Button wiring ──────────────────────────────────────────────────────

    // Reset
    document.getElementById('reset-btn').addEventListener('click', resetPuzzle);

    // Pause / Resume
    document.getElementById('pauseButton').addEventListener('click', () => {
      pauseTimer();
      showModal('pauseModal');
    });
    document.getElementById('resumeButton').addEventListener('click', () => {
      hideModal('pauseModal');
      resumeTimer();
    });

    // Help
    document.getElementById('help-btn').addEventListener('click', () => {
      pauseTimer();
      showModal('helpModal');
    });

    // Stats
    document.getElementById('stats-btn').addEventListener('click', () => {
      updateStatsDisplay();
      showModal('statsModal');
    });

    // Share
    document.getElementById('share-btn').addEventListener('click', showShareModal);
    document.getElementById('copy-share-btn').addEventListener('click', () => {
      navigator.clipboard.writeText(buildShareText()).then(() => {
        const ok = document.getElementById('copy-success');
        ok.style.display = 'flex';
        setTimeout(() => ok.style.display = 'none', 2000);
      });
    });

    // Win overlay buttons
    document.getElementById('win-stats-btn').addEventListener('click', () => {
      document.getElementById('win-overlay').classList.remove('visible');
      updateStatsDisplay();
      showModal('statsModal');
    });
    document.getElementById('win-share-btn').addEventListener('click', () => {
      document.getElementById('win-overlay').classList.remove('visible');
      showShareModal();
    });

    // Close buttons (data-dismiss pattern)
    document.querySelectorAll('[data-dismiss="modal"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const modal = btn.closest('[id$="Modal"]');
        if (modal) {
          hideModal(modal.id);
          if (modal.id === 'helpModal' || modal.id === 'pauseModal') resumeTimer();
        }
      });
    });

    // Click-outside to close
    document.querySelectorAll('[id$="Modal"]').forEach(modal => {
      modal.addEventListener('click', e => {
        if (e.target === modal) {
          hideModal(modal.id);
          if (modal.id === 'helpModal' || modal.id === 'pauseModal') resumeTimer();
        }
      });
    });

    // Close stats/share
    document.getElementById('close-stats-btn')?.addEventListener('click', () => hideModal('statsModal'));
    document.getElementById('close-share-btn')?.addEventListener('click', () => hideModal('shareModal'));
    document.getElementById('stats-share-btn')?.addEventListener('click', () => {
      hideModal('statsModal');
      showShareModal();
    });

    // Show welcome help on first visit (no saved state for today)
    if (!saved || saved.puzzleNumber !== puzzleNumber) {
      document.getElementById('helpLabel').textContent = 'Welcome to Rush Hour!';
      document.getElementById('startButton').style.display = 'inline-block';
      showModal('helpModal');
    } else if (solved) {
      document.getElementById('share-btn').style.display = 'inline-flex';
      const overlay = document.getElementById('win-overlay');
      overlay.classList.add('visible');
      overlay.querySelector('#win-moves').textContent = moves;
      overlay.querySelector('#win-time').textContent  = formatTime(elapsed);
      setWinPar(overlay);
    } else {
      resumeTimer();  // also clears isPaused which was set above
    }

    // Start button inside welcome modal
    document.getElementById('startButton').addEventListener('click', () => {
      hideModal('helpModal');
      document.getElementById('helpLabel').textContent = 'How to Play';
      document.getElementById('startButton').style.display = 'none';
      resumeTimer();
      startTimer();
    });
  }

  document.addEventListener('DOMContentLoaded', init);

})();
