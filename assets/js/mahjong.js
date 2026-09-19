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

// ─── State ──────────────────────────────────────────────────────────────────
let allHands = [];
let currentYear = DEFAULT_YEAR;
let editorBlocks = [];
let editorAltBlocks = [];

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
    await loadHands();
  });
}

// ─── Search pattern logic ────────────────────────────────────────────────────
function handMatchesQuery(hand, query) {
  const searchGroups = query
    .trim()
    .toUpperCase()
    .split(/\s+/)
    .filter(Boolean);

  if (searchGroups.length === 0) return true;

  const blocks = hand.pattern_blocks || [];

  // Try to assign each search group to a different pattern block.
  function canMatch(searchIndex, usedBlocks) {
    if (searchIndex === searchGroups.length) {
      return true;
    }

    const search = searchGroups[searchIndex];

    for (let i = 0; i < blocks.length; i++) {
      if (usedBlocks.has(i)) continue;

      if (blockCanContain(blocks[i].text, search)) {
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

function render() {
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

  container.innerHTML = groups
    .map((group, i) => `
      <div class="collapse collapse-arrow bg-base-100 shadow-sm">
        <input type="checkbox" ${query || i === 0 ? 'checked' : ''} />
        <div class="collapse-title font-bold">
          ${escapeHtml(group.category)}
          <span class="badge badge-sm badge-ghost ml-1">${group.hands.length}</span>
          ${group.note ? `<div class="text-xs font-normal text-base-content/60">${escapeHtml(group.note)}</div>` : ''}
        </div>
        <div class="collapse-content">
          ${group.hands.map((hand) => `
            <div class="mj-hand${isOwner ? ' mj-hand-editable' : ''}" data-hand-id="${hand.id}" ${isOwner ? 'role="button" tabindex="0"' : ''}>
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

  const payload = {
    card_year: currentYear,
    category,
    category_order: categoryOrder,
    sort_order: existing
      ? Math.max(...allHands.filter((h) => h.category === category).map((h) => h.sort_order)) + 1
      : 0,
    pattern_blocks: editorBlocks,
    alt_pattern_blocks: editorAltBlocks.length ? editorAltBlocks : null,
    value,
    concealed: document.getElementById('hand-concealed').value === 'true',
    notes: document.getElementById('hand-notes').value.trim() || null,
  };

  const result = id
    ? await updateHand(id, {
        category: payload.category,
        pattern_blocks: payload.pattern_blocks,
        alt_pattern_blocks: payload.alt_pattern_blocks,
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
