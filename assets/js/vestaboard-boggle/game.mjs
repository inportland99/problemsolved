export const DICE = Object.freeze([
  'AAEEGN', 'ABBJOO', 'ACHOPS', 'AFFKPS',
  'AOOTTW', 'CIMOTU', 'DEILRX', 'DELRVY',
  'DISTTY', 'EEGHNW', 'EEINSU', 'EHRTVW',
  'EIOSST', 'ELRTTY', 'HIMNUQ', 'HLNNRZ',
]);
export const DURATION_MS = 180000;
export const TIMER_TILES = 16;
export const TIMER_STAGES = TIMER_TILES / 2;
export const STEP_MS = DURATION_MS / TIMER_STAGES;
// Keep the existing stored terminal marker. New running frames are 0–7;
// frame 8 is reserved for compatibility with older rounds.
export const FINAL_STEP = 9;
export const COLORS = { orange: 64, green: 66, red: 63, black: 70 };
export const REVEAL_WIDTH = 16;
export const REVEAL_TITLE = 'DID YOU FIND?';
export const RULE_LINES = Object.freeze([
  'PLAY BOGGLE', 'FIND WORDS', '3+ LETTERS', 'VERT HORIZ DIAG', 'NO TILE REUSE',
]);

export function displayCharacter(code) {
  if (code >= 1 && code <= 26) return String.fromCharCode(code + 64);
  if (code >= 27 && code <= 35) return String(code - 26);
  if (code === 36) return '0';
  return code === 60 ? '?' : code === 46 ? '+' : '';
}

function centerLine(grid, row, text) {
  if (text.length > REVEAL_WIDTH) throw new Error('Board text is too wide');
  const start = Math.floor((REVEAL_WIDTH - text.length) / 2);
  [...text].forEach((letter, col) => {
    grid[row][start + col] = letter === '?' ? 60 : letter === '+' ? 46
      : letter === ' ' ? 0 : /^[1-9]$/.test(letter) ? Number(letter) + 26
      : letter === '0' ? 36 : letter.charCodeAt(0) - 64;
  });
}

export function rollBoard(random = Math.random) {
  const board = DICE.map(die => die[Math.floor(random() * 6)]);
  for (let i = board.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [board[i], board[j]] = [board[j], board[i]];
  }
  return board;
}

export function validBoard(board) {
  return Array.isArray(board) && board.length === 16 &&
    board.every(letter => typeof letter === 'string' && /^[A-Z]$/.test(letter));
}

export function timerStep(startedAt, now = Date.now()) {
  if (!startedAt) return 0;
  const elapsed = Math.max(0, now - Date.parse(startedAt));
  return elapsed >= DURATION_MS ? FINAL_STEP : Math.floor(elapsed / STEP_MS);
}

export function renderBoard(board, step = 0, { finishWords = null } = {}) {
  if (!validBoard(board)) throw new Error('Expected 16 uppercase letters');
  if (!Number.isInteger(step) || step < 0 || step > FINAL_STEP) throw new Error('Invalid timer step');
  const grid = Array.from({ length: 6 }, () => Array(22).fill(0));
  for (let row = 0; row < 6; row++) {
    for (let col = REVEAL_WIDTH; col < 22; col++) {
      if (row === 0 || row === 5 || col === REVEAL_WIDTH || col === 21) grid[row][col] = COLORS.orange;
    }
  }
  board.forEach((letter, i) => {
    grid[1 + Math.floor(i / 4)][17 + (i % 4)] = letter.charCodeAt(0) - 64;
  });
  const progress = Math.min(step, TIMER_STAGES - 1);
  for (let i = 0; i < TIMER_TILES; i++) {
    grid[5][i] = step === FINAL_STEP ? COLORS.black
      : i < progress || i >= TIMER_TILES - progress ? COLORS.red : COLORS.green;
  }
  if (step !== FINAL_STEP) {
    RULE_LINES.forEach((text, row) => centerLine(grid, row, text));
  } else if (finishWords !== null) {
    const lines = [REVEAL_TITLE, ...hardestWords(finishWords)];
    const top = Math.floor((5 - lines.length) / 2);
    lines.forEach((text, row) => centerLine(grid, top + row, text));
  }
  return grid;
}

// Length is a transparent difficulty proxy, not a frequency-based rating.
// Only words that fit the sixteen-column panel are displayed on the board.
// The phone's full solver list still includes longer dictionary entries.
export function hardestWords(words) {
  return [...new Set(words.filter(word => typeof word === 'string' &&
    /^[a-z]{3,17}$/i.test(word) && word.length <= REVEAL_WIDTH).map(word => word.toUpperCase()))]
    .sort((a, b) => b.length - a.length || (a < b ? -1 : a > b ? 1 : 0))
    .slice(0, 3);
}

export function buildTrie(words) {
  const root = new Map();
  for (const raw of words) {
    if (!/^[a-z]{3,17}$/.test(raw)) continue;
    let node = root;
    for (const letter of raw.toUpperCase()) {
      if (!node.has(letter)) node.set(letter, new Map());
      node = node.get(letter);
    }
    node.set('$', raw.toUpperCase());
  }
  return root;
}

const NEIGHBORS = Array.from({ length: 16 }, (_, index) =>
  Array.from({ length: 16 }, (_, next) => next).filter(next =>
    next !== index && Math.abs(Math.floor(next / 4) - Math.floor(index / 4)) <= 1 &&
    Math.abs(next % 4 - index % 4) <= 1));

export function solveBoard(board, trie) {
  if (!validBoard(board)) throw new Error('Expected 16 uppercase letters');
  const found = new Map();
  function visit(index, node, visited, path) {
    if (visited & (1 << index)) return;
    node = node.get(board[index]);
    if (board[index] === 'Q') node = node?.get('U');
    if (!node) return;
    const nextPath = [...path, index];
    if (node.has('$')) found.set(node.get('$'), found.get(node.get('$')) || nextPath);
    for (const next of NEIGHBORS[index]) visit(next, node, visited | (1 << index), nextPath);
  }
  for (let i = 0; i < 16; i++) visit(i, trie, 0, []);
  return [...found].map(([word, path]) => ({ word, path }))
    .sort((a, b) => b.word.length - a.word.length || a.word.localeCompare(b.word));
}
