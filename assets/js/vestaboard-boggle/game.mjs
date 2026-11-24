export const DICE = Object.freeze([
  'AAEEGN', 'ABBJOO', 'ACHOPS', 'AFFKPS',
  'AOOTTW', 'CIMOTU', 'DEILRX', 'DELRVY',
  'DISTTY', 'EEGHNW', 'EEINSU', 'EHRTVW',
  'EIOSST', 'ELRTTY', 'HIMNUQ', 'HLNNRZ',
]);
export const DURATION_MS = 180000;
export const STEP_MS = 20000;
export const COLORS = { green: 66, red: 63, black: 70 };
export const REVEAL_WIDTH = 17;
export const REVEAL_TITLE = 'DID YOU FIND?';

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
  return Math.min(9, Math.max(0, Math.floor((now - Date.parse(startedAt)) / STEP_MS)));
}

export function renderBoard(board, step = 0, { finishWords = null } = {}) {
  if (!validBoard(board)) throw new Error('Expected 16 uppercase letters');
  if (!Number.isInteger(step) || step < 0 || step > 9) throw new Error('Invalid timer step');
  const grid = Array.from({ length: 6 }, () => Array(22).fill(0));
  board.forEach((letter, i) => {
    grid[Math.floor(i / 4)][18 + (i % 4)] = letter.charCodeAt(0) - 64;
  });
  for (let i = 0; i < 18; i++) {
    grid[5][i + 2] = step === 9 ? COLORS.black
      : i < step || i >= 18 - step ? COLORS.red : COLORS.green;
  }
  if (step === 9 && finishWords !== null) {
    const words = hardestWords(finishWords);
    [REVEAL_TITLE, ...words].forEach((text, row) => {
      [...text].forEach((letter, col) => {
        grid[row][col] = letter === '?' ? 60 : letter === ' ' ? 0 : letter.charCodeAt(0) - 64;
      });
    });
  }
  return grid;
}

// Length is a transparent difficulty proxy, not a frequency-based rating.
// Every entry in our dictionary fits the 17 columns left of the grid.
export function hardestWords(words) {
  return [...new Set(words.filter(word => typeof word === 'string' &&
    /^[a-z]{3,17}$/i.test(word)).map(word => word.toUpperCase()))]
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
