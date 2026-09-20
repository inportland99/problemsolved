import { getCurrentUser, signOut } from '/assets/js/supabase-client.js';
import {
  getHands, getCardYears, createHand, updateHand, deleteHand,
  parsePatternBlocks, GROUP_COUNT,
} from '/assets/js/mahjong-db.js';

const LOGIN_URL = '/personal/coaching/login/';
const DEFAULT_YEAR = new Date().getFullYear();

// ─── Session ───────────────────────────────────────────────────────────────────
// Reads are public — this page renders for anyone with the link. Editing is
// restricted (by RLS) to whoever is logged in as the site owner, so we only
// reveal edit affordances once we know that's the case.
const user = await getCurrentUser();
const isOwner = !!user;

const sessionBtn = document.getElementById('session-btn');
if (isOwner) {
  sessionBtn.textContent = 'Log out';
  sessionBtn.addEventListener('click', async () => {
    await signOut();
    window.location.reload();
  });

  document.getElementById('add-hand-btn').classList.remove('hidden');
  document.getElementById('empty-add-btn').classList.remove('hidden');
} else {
  sessionBtn.textContent = 'Log in';
  sessionBtn.addEventListener('click', () => {
    window.location.href = LOGIN_URL;
  });
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function showAlert(message, type = 'info') {
  const container = document.getElementById('alert-container');
  const alert = document.createElement('div');
  alert.className = `alert alert-${type} shadow-sm py-2`;
  const span = document.createElement('span');
  span.textContent = message;
  alert.appendChild(span);
  container.appendChild(alert);
  setTimeout(() => alert.remove(), 4000);
}

function patternHtml(blocks) {
  return (blocks || [])
    .map((b) => `<span class="mj-block mj-g${b.group ?? 0}">${escapeHtml(b.text)}</span>`)
    .join('');
}

// A card line may print two ways to build the same hand, joined by "-or-".
function fullPatternHtml(hand) {
  const main = patternHtml(hand.pattern_blocks);
  if (!hand.alt_pattern_blocks || hand.alt_pattern_blocks.length === 0) return main;
  return `${main}<span class="mj-or">-or-</span>${patternHtml(hand.alt_pattern_blocks)}`;
}

// ─── State ────────────────────────────────────────────────────────────────────
let allHands = [];
let currentYear = DEFAULT_YEAR;
let editorBlocks = [];
let editorAltBlocks = [];

// Which category accordions are expanded, so re-rendering the list (e.g. when
// toggling a Prospective Hands checkbox) doesn't collapse everything back to
// just the first section. null means "not yet initialized" — render() then
// defaults to opening just the first category. Reset to null whenever the
// underlying hand set changes wholesale (switching years).
let openCategories = null;

// Hands the visitor is considering for their game, kept in localStorage so
// the list survives a page reload. Independent of search/owner status.
const PROSPECTIVE_STORAGE_KEY = 'mahjong-prospective-hands';
const prospectiveIds = loadProspectiveIds();
// handId -> index into that hand's search_patterns, for the tap-to-cycle
// feature in the Prospective Hands panel.
const prospectivePatternIndex = new Map();

function loadProspectiveIds() {
  try {
    const raw = localStorage.getItem(PROSPECTIVE_STORAGE_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

function saveProspectiveIds() {
  try {
    localStorage.setItem(PROSPECTIVE_STORAGE_KEY, JSON.stringify([...prospectiveIds]));
  } catch {
    // Ignore storage errors (e.g. private browsing).
  }
}

function toggleProspective(handId, isChecked) {
  if (isChecked) {
    prospectiveIds.add(handId);
    if (!prospectivePatternIndex.has(handId)) prospectivePatternIndex.set(handId, 0);
  } else {
    prospectiveIds.delete(handId);
    prospectivePatternIndex.delete(handId);
  }
  saveProspectiveIds();
  render();
}

function tokensEqual(a, b) {
  return !!a && !!b && a.length === b.length && a.every((t, i) => t.toUpperCase() === b[i].toUpperCase());
}

// Which of a hand's search_patterns rows represent something genuinely beyond
// its main + alt display pattern (e.g. the other Consecutive Run combinations,
// or the other kong numbers in a "Like kongs 2,4,6,8" line). The main and alt
// patterns are always shown together (see fullPatternHtml); tapping only ever
// cycles through these extras, so the alt is never replaced/hidden by a tap.
function extraVariantsFor(hand) {
  const mainTokens = (hand.pattern_blocks || []).map((b) => b.text);
  const altTokens = hand.alt_pattern_blocks?.length
    ? hand.alt_pattern_blocks.map((b) => b.text)
    : null;

  return (hand.search_patterns || []).filter(
    (row) => !tokensEqual(row, mainTokens) && !(altTokens && tokensEqual(row, altTokens))
  );
}

// Colors a token array using a given blocks array's group assignments,
// applied positionally (block i's color goes with token i).
function colorTokensWith(blocks, tokens) {
  if (!tokens || !blocks || tokens.length !== blocks.length) {
    return (tokens || []).map((text) => `<span class="mj-block mj-g0">${escapeHtml(text)}</span>`).join('');
  }
  return tokens
    .map((text, i) => `<span class="mj-block mj-g${blocks[i]?.group ?? 0}">${escapeHtml(text)}</span>`)
    .join('');
}

// Renders one extra pattern variant, reusing the color assigned to each
// position in pattern_blocks so the tile colors stay consistent as the
// displayed combination changes.
function coloredPatternFromTokens(hand, tokens) {
  return colorTokensWith(hand.pattern_blocks, tokens);
}

// True when the alt pattern is purely a recoloring of the exact same tiles as
// the main pattern (e.g. an "Any 1 or 2 Suits" line where -or- just swaps
// which blocks are which color), rather than a genuinely different
// combination. Only in that case does it make sense to reapply the alt's
// color scheme to *other* variants of the hand.
function altIsRecolorOnly(hand) {
  if (!hand.alt_pattern_blocks?.length) return false;
  const mainTokens = (hand.pattern_blocks || []).map((b) => b.text);
  const altTokens = hand.alt_pattern_blocks.map((b) => b.text);
  return tokensEqual(mainTokens, altTokens);
}

// The Prospective panel's default (untapped, index 0) state always looks like
// the main list — main pattern plus the printed "-or-" alternate, if any.
// Tapping past that cycles through extraVariantsFor(hand) one at a time.
//
// When the alt is a genuinely different combination (tied specifically to the
// main pattern's own tiles), it's only ever shown at index 0, exactly as
// printed on the card. When the alt is purely a recoloring of the same tiles,
// that recoloring is reapplied to whichever variant is currently displayed,
// so the "-or-" stays visible through every tap, not just the default one.
function prospectivePatternHtml(hand, index) {
  const extras = extraVariantsFor(hand);
  const atDefault = index <= 0 || extras.length === 0;

  if (!altIsRecolorOnly(hand)) {
    if (atDefault) return fullPatternHtml(hand);
    return coloredPatternFromTokens(hand, extras[(index - 1) % extras.length]);
  }

  const tokens = atDefault
    ? (hand.pattern_blocks || []).map((b) => b.text)
    : extras[(index - 1) % extras.length];

  const mainHtml = colorTokensWith(hand.pattern_blocks, tokens);
  const altHtml = colorTokensWith(hand.alt_pattern_blocks, tokens);
  return `${mainHtml}<span class="mj-or">-or-</span>${altHtml}`;
}

// ─── Year selector ──────────────────────────────────────────────────────────
async function initYears() {
  const result = await getCardYears();
  const years = result.success ? result.data : [];
  if (!years.includes(DEFAULT_YEAR)) years.unshift(DEFAULT_YEAR);

  currentYear = years[0];

  const select = document.getElementById('year-select');
  select.innerHTML = years
    .map((y) => `<option value="${y}">${y}</option>`)
    .join('');
  select.value = String(currentYear);

  select.addEventListener('change', async () => {
    currentYear = Number(select.value);
    openCategories = null; // re-default to "first section open" for the new year
    await loadHands();
  });
}

// ─── Search pattern logic ────────────────────────────────────────────────
// Matching runs entirely against hand.search_patterns — an array of tile-token
// arrays, one per valid combination for that hand. A hand matches if ANY one
// of its pattern options satisfies the query, so a search like "9999" can
// find a Consecutive Run hand whose *displayed* pattern doesn't contain it but
// whose other listed combinations do. See defaultSearchPatternRows() for how
// this is populated when a hand has no explicit search patterns of its own.
function handMatchesQuery(hand, query) {
  const searchGroups = query
    .trim()
    .toUpperCase()
    .split(/\s+/)
    .filter(Boolean);

  if (searchGroups.length === 0) return true;

  const patterns = hand.search_patterns || [];
  return patterns.some((blocks) => patternMatchesSearch(blocks, searchGroups));
}

// Try to assign each search group to a different block within one pattern option.
function patternMatchesSearch(blocks, searchGroups) {
  function canMatch(searchIndex, usedBlocks) {
    if (searchIndex === searchGroups.length) {
      return true;
    }

    const search = searchGroups[searchIndex];

    for (let i = 0; i < blocks.length; i++) {
      if (usedBlocks.has(i)) continue;

      if (blockCanContain(blocks[i], search)) {
        usedBlocks.add(i);

        if (canMatch(searchIndex + 1, usedBlocks)) {
          return true;
        }

        usedBlocks.delete(i);
      }
    }

    return false;
  }

  return canMatch(0, new Set());
}

function blockCanContain(blockText, searchText) {
  const blockCounts = countTiles(blockText);
  const searchCounts = countTiles(searchText);

  return Object.entries(searchCounts).every(
    ([tile, count]) => (blockCounts[tile] || 0) >= count
  );
}

function countTiles(text) {
  const counts = {};

  for (const tile of text.toUpperCase()) {
    counts[tile] = (counts[tile] || 0) + 1;
  }

  return counts;
}

// ─── Search pattern functions ───────────────────────────────────────────────
// converts a string into and JSON for storing in the database
function parseSearchPatterns(value) {
  return value
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => line.split(/\s+/));
}
// converts JSON to text for search and display in the editor
function formatSearchPatterns(patterns) {
  return (patterns || [])
    .map(pattern => pattern.join(' '))
    .join('\n');
}
// Default search-pattern rows derived from a hand's display pattern(s) (main
// + alt, if any), as plain text with no group info. Used both to prefill the
// editor and as the fallback when saving a hand with no explicit search
// patterns typed in, so every hand always has at least one row to match on.
function defaultSearchPatternRows(blocks, altBlocks) {
  const rows = [(blocks || []).map((block) => block.text)];
  if (altBlocks?.length) {
    rows.push(altBlocks.map((block) => block.text));
  }
  return rows;
}

// prepopulates the search pattern editor with the hand's patterns, if any.
// Falls back to defaultSearchPatternRows() for hands that haven't had
// explicit search patterns entered yet.
function getSearchPatternsForEdit(hand) {
  if (hand.search_patterns?.length) {
    return formatSearchPatterns(hand.search_patterns);
  }

  return formatSearchPatterns(defaultSearchPatternRows(hand.pattern_blocks, hand.alt_pattern_blocks));
}

// ─── Rendering ──────────────────────────────────────────────────────────────
function groupByCategory(hands) {
  const groups = [];
  const index = new Map();

  for (const hand of hands) {
    if (!index.has(hand.category)) {
      const group = { category: hand.category, note: hand.category_note, hands: [] };
      index.set(hand.category, group);
      groups.push(group);
    }
    index.get(hand.category).hands.push(hand);
  }
  return groups;
}

// Renders the "Prospective Hands" panel from prospectiveIds. Independent of
// the search box — it always shows every currently-loaded hand the visitor
// has checked, regardless of what's typed in the search field.
function renderProspectivePanel() {
  const section = document.getElementById('prospective-section');
  const list = document.getElementById('prospective-list');

  const hands = allHands.filter((h) => prospectiveIds.has(h.id));

  if (hands.length === 0) {
    section.classList.add('hidden');
    list.innerHTML = '';
    return;
  }

  section.classList.remove('hidden');

  list.innerHTML = hands
    .map((hand) => {
      const canCycle = extraVariantsFor(hand).length > 0;
      const index = prospectivePatternIndex.get(hand.id) || 0;
      return `
        <div class="mj-hand${canCycle ? ' mj-hand-editable' : ''}" data-hand-id="${hand.id}" ${canCycle ? 'role="button" tabindex="0"' : ''}>
          <input type="checkbox" class="checkbox checkbox-sm mj-prospective-check mt-1" data-hand-id="${hand.id}" checked />
          <div class="mj-pattern" data-prospective-pattern="${hand.id}">${prospectivePatternHtml(hand, index)}</div>
          <div class="mj-hand-meta">
            <span class="badge badge-sm ${hand.concealed ? 'badge-neutral' : 'badge-outline'}">
              ${hand.concealed ? 'C' : 'X'}
            </span>
            <span class="badge badge-sm badge-primary">${hand.value}</span>
          </div>
        </div>
      `;
    })
    .join('');

  list.querySelectorAll('.mj-prospective-check').forEach((checkbox) => {
    checkbox.addEventListener('click', (e) => e.stopPropagation());
    checkbox.addEventListener('change', (e) => {
      toggleProspective(e.target.dataset.handId, e.target.checked);
    });
  });

  list.querySelectorAll('.mj-hand').forEach((row) => {
    const handId = row.dataset.handId;
    const hand = hands.find((h) => h.id === handId);
    const extras = hand ? extraVariantsFor(hand) : [];
    if (!hand || extras.length === 0) return;

    // States are: 0 = default main+alt view, 1..extras.length = each extra
    // variant in turn, then wraps back to the default view.
    const totalStates = extras.length + 1;
    const cycle = () => {
      const next = ((prospectivePatternIndex.get(handId) || 0) + 1) % totalStates;
      prospectivePatternIndex.set(handId, next);
      row.querySelector('.mj-pattern').innerHTML = prospectivePatternHtml(hand, next);
    };

    row.addEventListener('click', cycle);
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        cycle();
      }
    });
  });
}

function render() {
  renderProspectivePanel();

  const query = document.getElementById('search').value.trim().toLowerCase();
  const container = document.getElementById('hands-container');
  const emptyState = document.getElementById('empty-state');
  const noResults = document.getElementById('no-results');

  container.classList.add('hidden');
  emptyState.classList.add('hidden');
  noResults.classList.add('hidden');

  if (allHands.length === 0) {
    emptyState.classList.remove('hidden');
    return;
  }

  const filtered = query
    ? allHands.filter((h) => handMatchesQuery(h, query))
    : allHands;

  if (filtered.length === 0) {
    noResults.classList.remove('hidden');
    return;
  }

  const groups = groupByCategory(filtered);

  // Default to opening just the first category the first time hands are
  // rendered for this year; after that, whatever the user has manually
  // expanded/collapsed persists across re-renders.
  if (openCategories === null) {
    openCategories = new Set(groups.length ? [groups[0].category] : []);
  }

  container.innerHTML = groups
    .map((group) => `
      <div class="collapse collapse-arrow bg-base-100 shadow-sm">
        <input type="checkbox" class="mj-category-toggle" data-category="${escapeHtml(group.category)}" ${query || openCategories.has(group.category) ? 'checked' : ''} />
        <div class="collapse-title font-bold">
          ${escapeHtml(group.category)}
          <span class="badge badge-sm badge-ghost ml-1">${group.hands.length}</span>
          ${group.note ? `<div class="text-xs font-normal text-base-content/60">${escapeHtml(group.note)}</div>` : ''}
        </div>
        <div class="collapse-content">
          ${group.hands.map((hand) => `
            <div class="mj-hand${isOwner ? ' mj-hand-editable' : ''}" data-hand-id="${hand.id}" ${isOwner ? 'role="button" tabindex="0"' : ''}>
              <input type="checkbox" class="checkbox checkbox-sm mj-prospective-check mt-1" data-hand-id="${hand.id}" ${prospectiveIds.has(hand.id) ? 'checked' : ''} />
              <div class="mj-pattern">${fullPatternHtml(hand)}
                ${hand.notes ? `<span class="text-xs font-normal text-base-content/60 mt-1 mb-1">(${escapeHtml(hand.notes)})</span>` : ''}
              </div>
              <div class="mj-hand-meta">
                <span class="badge badge-sm ${hand.concealed ? 'badge-neutral' : 'badge-outline'}">
                  ${hand.concealed ? 'C' : 'X'}
                </span>
                <span class="badge badge-sm badge-primary">${hand.value}</span>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `)
    .join('');

  container.classList.remove('hidden');

  container.querySelectorAll('.mj-category-toggle').forEach((toggle) => {
    toggle.addEventListener('change', () => {
      const category = toggle.dataset.category;
      if (toggle.checked) {
        openCategories.add(category);
      } else {
        openCategories.delete(category);
      }
    });
  });

  container.querySelectorAll('.mj-prospective-check').forEach((checkbox) => {
    checkbox.addEventListener('click', (e) => e.stopPropagation());
    checkbox.addEventListener('change', (e) => {
      toggleProspective(e.target.dataset.handId, e.target.checked);
    });
  });

  if (isOwner) {
    container.querySelectorAll('.mj-hand').forEach((row) => {
      const open = () => {
        const hand = allHands.find((h) => h.id === row.dataset.handId);
        if (hand) openModal(hand);
      };
      row.addEventListener('click', open);
      row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      });
    });
  }

  // Refresh the section autocomplete options
  document.getElementById('category-options').innerHTML = [...new Set(allHands.map((h) => h.category))]
    .map((c) => `<option value="${escapeHtml(c)}"></option>`)
    .join('');
}

async function loadHands() {
  const loading = document.getElementById('loading');
  loading.classList.remove('hidden');
  document.getElementById('hands-container').classList.add('hidden');

  const result = await getHands(currentYear);
  loading.classList.add('hidden');

  if (!result.success) {
    showAlert(result.error?.message || 'Could not load hands', 'error');
    return;
  }

  allHands = result.data;
  render();
}

document.getElementById('search').addEventListener('input', render);

// ─── Editor ─────────────────────────────────────────────────────────────────
const modal = document.getElementById('hand-modal');

// Renders a tappable block list; each tap cycles that block's color group.
function renderBlockEditor(previewId, getBlocks, emptyMessage) {
  const preview = document.getElementById(previewId);
  const blocks = getBlocks();

  if (blocks.length === 0) {
    preview.innerHTML = `<span class="text-sm font-normal text-base-content/40">${emptyMessage}</span>`;
    return;
  }

  preview.innerHTML = blocks
    .map((b, i) => `
      <button type="button" class="mj-block-btn mj-g${b.group}" data-i="${i}">
        ${escapeHtml(b.text)}
      </button>
    `)
    .join('');

  preview.querySelectorAll('.mj-block-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const i = Number(btn.dataset.i);
      const current = getBlocks();
      current[i].group = (current[i].group + 1) % GROUP_COUNT;
      renderBlockEditor(previewId, getBlocks, emptyMessage);
    });
  });
}

function renderEditorPreview() {
  renderBlockEditor('pattern-preview', () => editorBlocks, 'Type a pattern above');
}

function renderAltEditorPreview() {
  document.getElementById('alt-preview-wrap').classList.toggle('hidden', editorAltBlocks.length === 0);
  renderBlockEditor('alt-pattern-preview', () => editorAltBlocks, '');
}

document.getElementById('hand-pattern').addEventListener('input', (e) => {
  editorBlocks = parsePatternBlocks(e.target.value, editorBlocks);
  renderEditorPreview();
});

document.getElementById('hand-alt-pattern').addEventListener('input', (e) => {
  editorAltBlocks = parsePatternBlocks(e.target.value, editorAltBlocks);
  renderAltEditorPreview();
});

function openModal(hand = null) {
  document.getElementById('hand-modal-title').textContent = hand ? 'Edit Hand' : 'Add Hand';
  document.getElementById('hand-id').value = hand?.id || '';
  document.getElementById('hand-category').value = hand?.category || '';
  document.getElementById('hand-value').value = hand?.value ?? '';
  document.getElementById('hand-concealed').value = String(hand?.concealed ?? false);
  document.getElementById('hand-notes').value = hand?.notes || '';
  document.getElementById('hand-search-patterns').value = hand ? getSearchPatternsForEdit(hand) : '';

  editorBlocks = hand
    ? (hand.pattern_blocks || []).map((b) => ({ text: b.text, group: b.group ?? 0 }))
    : [];
  document.getElementById('hand-pattern').value = editorBlocks.map((b) => b.text).join(' ');
  renderEditorPreview();

  editorAltBlocks = hand
    ? (hand.alt_pattern_blocks || []).map((b) => ({ text: b.text, group: b.group ?? 0 }))
    : [];
  document.getElementById('hand-alt-pattern').value = editorAltBlocks.map((b) => b.text).join(' ');
  renderAltEditorPreview();

  document.getElementById('delete-hand-btn').classList.toggle('hidden', !hand);
  modal.showModal();
}

document.getElementById('add-hand-btn').addEventListener('click', () => openModal());
document.getElementById('empty-add-btn').addEventListener('click', () => openModal());

document.getElementById('save-hand-btn').addEventListener('click', async () => {
  const id = document.getElementById('hand-id').value;
  const category = document.getElementById('hand-category').value.trim();
  const value = Number(document.getElementById('hand-value').value);

  if (!category) return showAlert('Section is required', 'warning');
  if (editorBlocks.length === 0) return showAlert('Pattern is required', 'warning');
  if (!Number.isFinite(value) || value <= 0) return showAlert('Value is required', 'warning');

  // Keep new sections grouped in the order they were first added.
  const existing = allHands.find((h) => h.category === category);
  const categoryOrder = existing
    ? existing.category_order
    : new Set(allHands.map((h) => h.category)).size;

  // Prepares the search patterns for the hand, either from the editor or
  // (when left blank) derived from the main/alt display patterns, so every
  // hand always has at least one row to match on.
  const searchPatterns = parseSearchPatterns(
    document.getElementById('hand-search-patterns').value.trim()
  );

  if (searchPatterns.length === 0) {
    searchPatterns.push(...defaultSearchPatternRows(editorBlocks, editorAltBlocks));
  }

  // Prepares the payload for creating or updating a hand.
  const payload = {
    card_year: currentYear,
    category,
    category_order: categoryOrder,
    sort_order: existing
      ? Math.max(...allHands.filter((h) => h.category === category).map((h) => h.sort_order)) + 1
      : 0,
    pattern_blocks: editorBlocks,
    alt_pattern_blocks: editorAltBlocks.length ? editorAltBlocks : null,
    search_patterns: searchPatterns,
    value,
    concealed: document.getElementById('hand-concealed').value === 'true',
    notes: document.getElementById('hand-notes').value.trim() || null,
  };

  const result = id
    ? await updateHand(id, {
        category: payload.category,
        pattern_blocks: payload.pattern_blocks,
        alt_pattern_blocks: payload.alt_pattern_blocks,
        search_patterns: payload.search_patterns,
        value: payload.value,
        concealed: payload.concealed,
        notes: payload.notes,
      })
    : await createHand(payload);

  if (!result.success) {
    showAlert(result.error?.message || 'Could not save hand', 'error');
    return;
  }

  modal.close();
  showAlert(id ? 'Hand updated' : 'Hand added', 'success');
  await loadHands();
});

document.getElementById('delete-hand-btn').addEventListener('click', async () => {
  const id = document.getElementById('hand-id').value;
  if (!id || !confirm('Delete this hand?')) return;

  const result = await deleteHand(id);
  if (!result.success) {
    showAlert(result.error?.message || 'Could not delete hand', 'error');
    return;
  }

  modal.close();
  showAlert('Hand deleted', 'success');
  await loadHands();
});

// ─── Boot ───────────────────────────────────────────────────────────────────
await initYears();
await loadHands();
