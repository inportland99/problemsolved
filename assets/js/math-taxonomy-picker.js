/**
 * Renders the "Math Content" tagging UI: Grade/Course and Domain
 * filter chips (used only to narrow the browse checklist below, never
 * stored directly), a Grade/Domain-grouped Math Topic checklist, a
 * topic name search box that works independently of the filters, and
 * a removable "Selected Topics" list with a star control marking one
 * topic as primary.
 *
 * A user tags a lesson by checking specific taxonomy rows (each
 * representing one valid Grade/Course + Domain + Math Topic
 * combination) via either the grouped checklist or search results —
 * both paths write to the same underlying selection.
 *
 * @param {HTMLElement} container - Element to render the picker into.
 * @param {Array} taxonomy - Flat rows from getTaxonomy(): { id, gradeCourse, gradeCourseSortOrder, domain, domainSortOrder, topic, ccssReference }
 * @param {Object} initialSelection - Optional { taxonomyIds: number[], primaryTaxonomyId: number|null }
 * @returns {{ getSelection: () => { taxonomyIds: number[], primaryTaxonomyId: number|null } }}
 */
export function renderTaxonomyPicker(container, taxonomy, initialSelection = {}) {
  // Guard against duplicate delegated listeners if this is called more
  // than once on the same container (e.g. an initial empty render
  // followed by a re-render once an existing lesson's tags load).
  if (container.__taxonomyPickerAbort) {
    container.__taxonomyPickerAbort.abort();
  }
  const abortController = new AbortController();
  container.__taxonomyPickerAbort = abortController;
  const { signal } = abortController;

  const byId = new Map(taxonomy.map(row => [row.id, row]));

  const state = {
    filterGrades: new Set(),
    filterDomains: new Set(),
    selectedIds: new Set(initialSelection.taxonomyIds || []),
    primaryId: initialSelection.primaryTaxonomyId ?? null,
    searchQuery: ''
  };

  const DOMAIN_SHORT = {
    'Number & Operations—Fractions': 'Fractions',
    'Number & Operations in Base Ten': 'Base Ten',
    'Operations & Algebraic Thinking': 'Operations & Algebra',
    'Ratios & Proportional Relationships': 'Ratios & Proportions'
  };

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text == null ? '' : String(text);
    return div.innerHTML;
  }

  function gradeChipLabel(name) {
    if (name === 'K') return 'K';
    if (name.startsWith('Grade ')) return name.slice(6);
    if (name === 'Algebra 1') return 'Alg 1';
    if (name === 'Algebra 2') return 'Alg 2';
    if (name === 'Precalculus') return 'Precalc';
    return name;
  }

  function domainShortLabel(name) {
    return DOMAIN_SHORT[name] || name;
  }

  // Unique, sort-ordered Grade/Course and Domain option lists derived
  // from the taxonomy itself (no separate lookups needed).
  function uniqueOptions(key, sortKey) {
    const seen = new Map();
    taxonomy.forEach(row => {
      if (!seen.has(row[key])) seen.set(row[key], row[sortKey]);
    });
    return Array.from(seen.entries())
      .sort((a, b) => a[1] - b[1])
      .map(([name]) => name);
  }

  const allGrades = uniqueOptions('gradeCourse', 'gradeCourseSortOrder');

  function availableDomains() {
    const rows = state.filterGrades.size === 0
      ? taxonomy
      : taxonomy.filter(row => state.filterGrades.has(row.gradeCourse));
    const seen = new Map();
    rows.forEach(row => {
      if (!seen.has(row.domain)) seen.set(row.domain, row.domainSortOrder);
    });
    return Array.from(seen.entries())
      .sort((a, b) => a[1] - b[1])
      .map(([name]) => name);
  }

  function rowMatchesFilters(row) {
    const gradeOk = state.filterGrades.size === 0 || state.filterGrades.has(row.gradeCourse);
    const domainOk = state.filterDomains.size === 0 || state.filterDomains.has(row.domain);
    return gradeOk && domainOk;
  }

  function browseRows() {
    return taxonomy.filter(row => rowMatchesFilters(row) || state.selectedIds.has(row.id));
  }

  function groupedBrowseRows() {
    const groups = new Map();
    browseRows().forEach(row => {
      const key = `${row.gradeCourse}|||${row.domain}`;
      if (!groups.has(key)) {
        groups.set(key, {
          gradeCourse: row.gradeCourse,
          gradeCourseSortOrder: row.gradeCourseSortOrder,
          domain: row.domain,
          domainSortOrder: row.domainSortOrder,
          rows: []
        });
      }
      groups.get(key).rows.push(row);
    });
    return Array.from(groups.values())
      .sort((a, b) => a.gradeCourseSortOrder - b.gradeCourseSortOrder || a.domainSortOrder - b.domainSortOrder)
      .map(group => ({
        ...group,
        rows: group.rows.slice().sort((a, b) => a.topic.localeCompare(b.topic))
      }));
  }

  function searchResults() {
    const q = state.searchQuery.trim().toLowerCase();
    if (!q) return [];
    return taxonomy
      .filter(row => row.topic.toLowerCase().includes(q))
      .sort((a, b) =>
        a.gradeCourseSortOrder - b.gradeCourseSortOrder ||
        a.domainSortOrder - b.domainSortOrder ||
        a.topic.localeCompare(b.topic)
      );
  }

  function chipHtml(group, value, label, isSelected) {
    return `
      <button type="button" class="btn btn-xs ${isSelected ? 'btn-primary' : 'btn-outline'} taxonomy-chip"
        data-chip-group="${group}" data-value="${escapeHtml(value)}">
        ${escapeHtml(label)}
      </button>`;
  }

  function topicRowHtml(row, { showGroupContext = false } = {}) {
    const checked = state.selectedIds.has(row.id);
    const context = showGroupContext
      ? `<span class="text-xs text-base-content/60">${escapeHtml(row.gradeCourse)} • ${escapeHtml(domainShortLabel(row.domain))} → </span>`
      : '';
    return `
      <label class="flex items-start gap-2 py-1 cursor-pointer">
        <input type="checkbox" class="checkbox checkbox-sm mt-0.5 topic-checkbox" data-id="${row.id}" ${checked ? 'checked' : ''}>
        <span class="text-sm">${context}${escapeHtml(row.topic)}</span>
      </label>`;
  }

  function renderBrowseSection() {
    const groups = groupedBrowseRows();
    if (groups.length === 0) {
      return '<p class="text-sm text-base-content/50">No topics match the selected Grade/Course and Domain filters.</p>';
    }
    return groups.map(group => `
      <div class="mb-3">
        <p class="text-xs font-semibold text-base-content/60 mb-1">${escapeHtml(group.gradeCourse)} • ${escapeHtml(group.domain)}</p>
        <div class="pl-1">
          ${group.rows.map(row => topicRowHtml(row)).join('')}
        </div>
      </div>`).join('');
  }

  function renderSearchSection() {
    const results = searchResults();
    if (results.length === 0) {
      return '<p class="text-sm text-base-content/50">No topics match your search.</p>';
    }
    return `<div>${results.map(row => topicRowHtml(row, { showGroupContext: true })).join('')}</div>`;
  }

  function renderSelected() {
    const rows = Array.from(state.selectedIds)
      .map(id => byId.get(id))
      .filter(Boolean)
      .sort((a, b) => (b.id === state.primaryId) - (a.id === state.primaryId));

    if (rows.length === 0) {
      return '<p class="text-sm text-base-content/50">No Math Topics selected yet.</p>';
    }

    return rows.map(row => {
      const isPrimary = row.id === state.primaryId;
      return `
        <div class="flex items-center gap-2 py-1">
          <button type="button" class="star-btn text-lg leading-none ${isPrimary ? 'text-warning' : 'text-base-content/30 hover:text-warning'}"
            data-id="${row.id}" title="${isPrimary ? 'Primary Math Topic' : 'Set as Primary Math Topic'}">
            ${isPrimary ? '★' : '☆'}
          </button>
          <span class="text-sm flex-1">${escapeHtml(row.gradeCourse)} · ${escapeHtml(domainShortLabel(row.domain))} · ${escapeHtml(row.topic)}</span>
          <button type="button" class="remove-selected-btn btn btn-ghost btn-xs" data-id="${row.id}" aria-label="Remove">✕</button>
        </div>`;
    }).join('');
  }

  function render() {
    const searchInput = container.querySelector('[data-role="topic-search"]');
    const hadFocus = document.activeElement === searchInput;
    const selectionStart = hadFocus ? searchInput.selectionStart : null;
    const selectionEnd = hadFocus ? searchInput.selectionEnd : null;

    const domains = availableDomains();

    container.innerHTML = `
      <div class="space-y-4">
        <div>
          <p class="text-sm font-medium mb-2">Grade/Course</p>
          <div class="flex flex-wrap gap-1.5">
            ${allGrades.map(g => chipHtml('grade', g, gradeChipLabel(g), state.filterGrades.has(g))).join('')}
          </div>
        </div>

        <div>
          <p class="text-sm font-medium mb-2">Domain</p>
          <div class="flex flex-wrap gap-1.5">
            ${chipHtml('domain', '__all__', 'All', state.filterDomains.size === 0)}
            ${domains.map(d => chipHtml('domain', d, domainShortLabel(d), state.filterDomains.has(d))).join('')}
          </div>
        </div>

        <div>
          <input type="text" class="input input-bordered input-sm w-full max-w-sm" data-role="topic-search"
            placeholder="Search math topics..." value="${escapeHtml(state.searchQuery)}">
        </div>

        <div data-role="topic-list" class="max-h-80 overflow-y-auto border border-base-300 rounded-lg p-3">
          ${state.searchQuery.trim() ? renderSearchSection() : renderBrowseSection()}
        </div>

        <div>
          <p class="text-sm font-medium mb-2">Selected Topics</p>
          <div data-role="selected-list" class="space-y-0.5">
            ${renderSelected()}
          </div>
        </div>
      </div>`;

    if (hadFocus) {
      const newInput = container.querySelector('[data-role="topic-search"]');
      newInput.focus();
      newInput.setSelectionRange(selectionStart, selectionEnd);
    }
  }

  container.addEventListener('click', (e) => {
    const chip = e.target.closest('.taxonomy-chip');
    if (chip) {
      const group = chip.dataset.chipGroup;
      const value = chip.dataset.value;
      if (group === 'grade') {
        if (state.filterGrades.has(value)) {
          state.filterGrades.delete(value);
        } else {
          state.filterGrades.add(value);
        }
        // Dropping a domain filter that's no longer available for the
        // newly selected grades keeps the UI consistent.
        const stillAvailable = new Set(availableDomains());
        Array.from(state.filterDomains).forEach(d => {
          if (!stillAvailable.has(d)) state.filterDomains.delete(d);
        });
      } else if (group === 'domain') {
        if (value === '__all__') {
          state.filterDomains.clear();
        } else if (state.filterDomains.has(value)) {
          state.filterDomains.delete(value);
        } else {
          state.filterDomains.add(value);
        }
      }
      render();
      return;
    }

    const starBtn = e.target.closest('.star-btn');
    if (starBtn) {
      const id = Number(starBtn.dataset.id);
      state.primaryId = state.primaryId === id ? null : id;
      render();
      return;
    }

    const removeBtn = e.target.closest('.remove-selected-btn');
    if (removeBtn) {
      const id = Number(removeBtn.dataset.id);
      state.selectedIds.delete(id);
      if (state.primaryId === id) state.primaryId = null;
      render();
    }
  }, { signal });

  container.addEventListener('change', (e) => {
    const checkbox = e.target.closest('.topic-checkbox');
    if (!checkbox) return;
    const id = Number(checkbox.dataset.id);
    if (checkbox.checked) {
      state.selectedIds.add(id);
    } else {
      state.selectedIds.delete(id);
      if (state.primaryId === id) state.primaryId = null;
    }
    render();
  }, { signal });

  container.addEventListener('input', (e) => {
    const input = e.target.closest('[data-role="topic-search"]');
    if (!input) return;
    state.searchQuery = input.value;
    render();
  }, { signal });

  render();

  return {
    getSelection() {
      return {
        taxonomyIds: Array.from(state.selectedIds),
        primaryTaxonomyId: state.primaryId
      };
    }
  };
}
