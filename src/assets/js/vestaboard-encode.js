// Vestaboard character-code helpers.
//
// Reference: https://docs.vestaboard.com/docs/characterCodes
// 0 = blank, 1-26 = A-Z, 27-35 = 1-9, 36 = 0, 37-62 = punctuation (with gaps),
// 63-70 = colors, 71 = filled/inverse block.
//
// This module is client-only. It is used for local preview rendering; the
// actual text centering/wrapping for "text" mode items is still performed
// server-side by the Vestaboard API when the message is sent.

export const ROWS = 6;
export const COLS = 22;

export const COLOR_CODES = {
  red: 63,
  orange: 64,
  yellow: 65,
  green: 66,
  blue: 67,
  violet: 68,
  purple: 68,
  white: 69,
  black: 70,
  filled: 71,
};

export const COLOR_NAMES = {
  63: 'Red',
  64: 'Orange',
  65: 'Yellow',
  66: 'Green',
  67: 'Blue',
  68: 'Violet',
  69: 'White',
  70: 'Black',
  71: 'Filled',
};

// Approximate on-screen swatches for the editor palette / preview.
export const COLOR_HEX = {
  63: '#c1272d',
  64: '#f7941d',
  65: '#fdd80f',
  66: '#39b54a',
  67: '#0071bc',
  68: '#92278f',
  69: '#ffffff',
  70: '#1a1a1a',
  71: '#5a5a5a',
};

export const COLOR_CODE_LIST = [63, 64, 65, 66, 67, 68, 69, 70, 71];

const LETTER_CODES = {};
for (let i = 0; i < 26; i++) {
  LETTER_CODES[String.fromCharCode(65 + i)] = i + 1;
}

const DIGIT_CODES = {
  1: 27, 2: 28, 3: 29, 4: 30, 5: 31, 6: 32, 7: 33, 8: 34, 9: 35, 0: 36,
};

export const PUNCTUATION_CODES = {
  '!': 37,
  '@': 38,
  '#': 39,
  $: 40,
  '(': 41,
  ')': 42,
  '-': 44,
  '+': 46,
  '&': 47,
  '=': 48,
  ';': 49,
  ':': 50,
  "'": 52,
  '"': 53,
  '%': 54,
  ',': 55,
  '.': 56,
  '/': 59,
  '?': 60,
  '\u00b0': 62, // degree sign
};

export const PUNCTUATION_PALETTE = Object.keys(PUNCTUATION_CODES);
export const LETTER_PALETTE = Object.keys(LETTER_CODES);
export const DIGIT_PALETTE = Object.keys(DIGIT_CODES);

const CODE_TO_PUNCTUATION = Object.fromEntries(
  Object.entries(PUNCTUATION_CODES).map(([ch, code]) => [code, ch])
);

/** Converts a single printable character to its Vestaboard character code. */
export function charToCode(ch) {
  if (ch === ' ') return 0;
  const upper = ch.toUpperCase();
  if (LETTER_CODES[upper] !== undefined) return LETTER_CODES[upper];
  if (DIGIT_CODES[ch] !== undefined) return DIGIT_CODES[ch];
  if (PUNCTUATION_CODES[ch] !== undefined) return PUNCTUATION_CODES[ch];
  return 0; // unsupported character -> blank
}

/** Converts a Vestaboard character code back to a displayable character (colors return ''). */
export function codeToChar(code) {
  if (!code) return '';
  if (code >= 1 && code <= 26) return String.fromCharCode(64 + code);
  if (code >= 27 && code <= 35) return String(code - 26);
  if (code === 36) return '0';
  if (CODE_TO_PUNCTUATION[code]) return CODE_TO_PUNCTUATION[code];
  return '';
}

export function isColorCode(code) {
  return code >= 63 && code <= 71;
}

export function createEmptyGrid() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(0));
}

/** Deep-clones a 6x22 grid, padding/truncating to the correct dimensions. */
export function normalizeGrid(grid) {
  const out = createEmptyGrid();
  if (!Array.isArray(grid)) return out;
  for (let r = 0; r < ROWS; r++) {
    const row = Array.isArray(grid[r]) ? grid[r] : [];
    for (let c = 0; c < COLS; c++) {
      const val = Number(row[c]);
      out[r][c] = Number.isFinite(val) ? val : 0;
    }
  }
  return out;
}

// Tokenizes a string into character codes, treating {name} or {number}
// groups (e.g. "{red}" or "{63}") as a single token/column.
function tokenizeLine(line) {
  const tokens = [];
  const re = /\{([^}]+)\}|[\s\S]/g;
  let match;
  while ((match = re.exec(line)) !== null) {
    if (match[1] !== undefined) {
      const key = match[1].trim().toLowerCase();
      if (COLOR_CODES[key] !== undefined) {
        tokens.push(COLOR_CODES[key]);
      } else if (/^\d+$/.test(key)) {
        tokens.push(parseInt(key, 10));
      } else {
        tokens.push(0);
      }
    } else {
      tokens.push(charToCode(match[0]));
    }
  }
  return tokens;
}

function splitWords(str) {
  return str.split(/\s+/).filter((w) => w.length > 0);
}

function wrapParagraph(paragraph) {
  const words = splitWords(paragraph);
  const lines = [];
  let current = [];
  let currentLen = 0;

  for (const word of words) {
    const wLen = tokenizeLine(word).length;
    const sepLen = current.length > 0 ? 1 : 0;
    if (currentLen + sepLen + wLen > COLS && current.length > 0) {
      lines.push(current.join(' '));
      current = [word];
      currentLen = wLen;
    } else {
      current.push(word);
      currentLen += sepLen + wLen;
    }
  }
  if (current.length > 0 || lines.length === 0) {
    lines.push(current.join(' '));
  }
  return lines;
}

/**
 * Best-effort local approximation of how Vestaboard will center and wrap a
 * plain-text message. This is only used for the live preview; the actual
 * message sent to the board uses the `text` field directly, and Vestaboard's
 * own servers handle the true centering/wrapping.
 */
export function approximateTextToGrid(text) {
  const grid = createEmptyGrid();
  const paragraphs = (text || '').split('\n');
  let lines = [];
  paragraphs.forEach((p) => {
    lines = lines.concat(wrapParagraph(p));
  });
  lines = lines.slice(0, ROWS);

  const topPad = Math.floor((ROWS - lines.length) / 2);
  lines.forEach((line, i) => {
    const rowIndex = topPad + i;
    if (rowIndex < 0 || rowIndex >= ROWS) return;
    const tokens = tokenizeLine(line);
    const leftPad = Math.floor((COLS - tokens.length) / 2);
    tokens.forEach((code, j) => {
      const col = leftPad + j;
      if (col >= 0 && col < COLS) grid[rowIndex][col] = code;
    });
  });

  return grid;
}

/** Renders a 6x22 grid of character codes as HTML tiles for a live preview or editor. */
export function renderGridPreview(grid, { cellClass = '', interactive = false } = {}) {
  const normalized = normalizeGrid(grid);
  let html = '';
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const code = normalized[r][c];
      const dataAttrs = `data-row="${r}" data-col="${c}" data-code="${code}"`;
      const clickable = interactive ? 'vb-cell-interactive cursor-pointer' : '';
      if (isColorCode(code)) {
        html += `<div class="vb-cell ${cellClass} ${clickable}" ${dataAttrs} style="background-color:${COLOR_HEX[code]}"></div>`;
      } else {
        html += `<div class="vb-cell ${cellClass} ${clickable}" ${dataAttrs}>${codeToChar(code)}</div>`;
      }
    }
  }
  return html;
}
