// act-tracker.js
// All state persisted to localStorage under the key "act_tracker_v1"

const STORAGE_KEY = "act_tracker_v1";

const CATS = {
  reading: [
    "Main idea", "Detail", "Inference", "Vocabulary in context",
    "Author purpose", "Tone / attitude", "Passage structure", "Comparative passages"
  ],
  english: [
    "Punctuation", "Subject-verb agreement", "Pronoun agreement", "Verb tense",
    "Modifiers", "Redundancy", "Transitions", "Sentence structure",
    "Word choice", "Parallelism"
  ],
  math: [
    "Algebra", "Linear equations", "Systems", "Quadratics", "Functions",
    "Geometry", "Trigonometry", "Statistics", "Probability",
    "Number properties", "Ratios & proportions", "Word problems"
  ]
};

const ROWS = [
  { key: "reading", label: "Reading",  sub: "1 passage",     ph: "score" },
  { key: "english", label: "English",  sub: "15 problems",   ph: "/15" },
  { key: "math",    label: "Math",     sub: "10 problems",   ph: "/10" },
  { key: "review",  label: "Review",   sub: "check answers", ph: null }
];

const BADGE_CLASS = {
  reading: "badge-primary",
  english: "badge-success",
  math:    "badge-warning"
};

const BAR_COLOR = {
  reading: "bg-primary",
  english: "bg-success",
  math:    "bg-warning"
};

// ── State ──────────────────────────────────────────────────────────────────

let weekOffset = 0;
let appState = loadState();

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : { tracker: {}, errors: [] };
  } catch {
    return { tracker: {}, errors: [] };
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
  } catch (e) {
    console.warn("localStorage save failed", e);
  }
}

// ── Date helpers ───────────────────────────────────────────────────────────

function getMondayOf(offset) {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const mon = new Date(now);
  mon.setDate(now.getDate() + diff + offset * 7);
  mon.setHours(0, 0, 0, 0);
  return mon;
}

function getWeekDates(offset) {
  const mon = getMondayOf(offset);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    return d;
  });
}

function fmt(d) {
  return (d.getMonth() + 1) + "/" + d.getDate();
}

function isToday(d) {
  const n = new Date();
  return d.getDate() === n.getDate() &&
    d.getMonth() === n.getMonth() &&
    d.getFullYear() === n.getFullYear();
}

function weekKey() {
  return getMondayOf(weekOffset).toISOString().slice(0, 10);
}

function cellId(rowKey, dayIdx) {
  return weekKey() + "_" + rowKey + "_" + dayIdx;
}

// ── Tracker tab ────────────────────────────────────────────────────────────

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function renderGrid() {
  const dates = getWeekDates(weekOffset);
  document.getElementById("week-label").textContent =
    "Week of " + fmt(dates[0]) + " – " + fmt(dates[6]);

  // Header row
  const headerRow = document.getElementById("day-header-row");
  headerRow.innerHTML = `<th class="w-24 bg-base-200"></th>`;
  dates.forEach((d, i) => {
    const today = isToday(d);
    headerRow.innerHTML += `
      <th class="text-center ${today ? "bg-primary/10" : "bg-base-200"} min-w-[72px]">
        <div class="font-semibold text-sm">${DAY_NAMES[i]}</div>
        <div class="text-xs font-normal opacity-50">${fmt(d)}</div>
      </th>`;
  });

  // Body rows
  const tbody = document.getElementById("tracker-body");
  tbody.innerHTML = "";

  ROWS.forEach((row, ri) => {
    const tr = document.createElement("tr");
    tr.className = ri % 2 === 0 ? "" : "bg-base-100";

    // Row label
    let labelCell = `<td class="bg-base-200 font-medium text-sm">
        <div>${row.label}</div>
        <div class="text-xs opacity-40 font-normal">${row.sub}</div>
      </td>`;

    // Day cells
    let dayCells = "";
    dates.forEach((d, di) => {
      const id = cellId(row.key, di);
      const s = appState.tracker[id] || {};
      const today = isToday(d);
      const todayClass = today ? "bg-primary/5" : "";

      if (row.ph === null) {
        // Review row — checkbox only
        dayCells += `<td class="text-center ${todayClass}">
          <input type="checkbox" class="checkbox checkbox-primary checkbox-sm"
            ${s.done ? "checked" : ""}
            onchange="setCellDone('${id}', this.checked)" />
        </td>`;
      } else {
        dayCells += `<td class="text-center ${todayClass}">
          <div class="flex flex-col items-center gap-1">
            <input type="checkbox" class="checkbox checkbox-primary checkbox-sm"
              ${s.done ? "checked" : ""}
              onchange="setCellDone('${id}', this.checked)" />
            <input type="text" class="input input-bordered input-xs w-14 text-center"
              placeholder="${row.ph}"
              value="${s.score || ""}"
              oninput="setCellScore('${id}', this.value)" />
          </div>
        </td>`;
      }
    });

    tr.innerHTML = labelCell + dayCells;
    tbody.appendChild(tr);
  });

  updateSummary();
}

function setCellDone(id, val) {
  appState.tracker[id] = Object.assign(appState.tracker[id] || {}, { done: val });
  saveState();
  updateSummary();
}

function setCellScore(id, val) {
  appState.tracker[id] = Object.assign(appState.tracker[id] || {}, { score: val });
  saveState();
  updateSummary();
}

function updateSummary() {
  let completeDays = 0, totalTasks = 0, doneTasks = 0;
  const scores = { reading: [], english: [], math: [] };

  for (let di = 0; di < 7; di++) {
    let dayDone = true;
    ROWS.forEach(row => {
      const id = cellId(row.key, di);
      const s = appState.tracker[id] || {};
      totalTasks++;
      if (s.done) doneTasks++; else dayDone = false;
      if (s.score && row.key !== "review") {
        const n = parseFloat(s.score);
        if (!isNaN(n)) scores[row.key].push(n);
      }
    });
    if (dayDone) completeDays++;
  }

  document.getElementById("stat-days").textContent = completeDays + " / 7";

  function avg(arr) {
    if (!arr.length) return "—";
    return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length * 10) / 10;
  }
  document.getElementById("stat-reading").textContent = avg(scores.reading);
  document.getElementById("stat-english").textContent = avg(scores.english);
  document.getElementById("stat-math").textContent = avg(scores.math);

  const pct = totalTasks ? Math.round(doneTasks / totalTasks * 100) : 0;
  document.getElementById("week-progress").value = pct;
  document.getElementById("bar-pct").textContent = pct + "%";
}

function changeWeek(dir) {
  weekOffset = dir === 0 ? 0 : weekOffset + dir;
  renderGrid();
}

// ── Tab switching ──────────────────────────────────────────────────────────

function switchTab(tab) {
  const isTracker = tab === "tracker";
  document.getElementById("tab-tracker").classList.toggle("hidden", !isTracker);
  document.getElementById("tab-errors").classList.toggle("hidden", isTracker);
  document.getElementById("tab-tracker-btn").classList.toggle("tab-active", isTracker);
  document.getElementById("tab-errors-btn").classList.toggle("tab-active", !isTracker);
  if (!isTracker) { populateCatSelect(); renderErrors(); }
}

// ── Error log tab ──────────────────────────────────────────────────────────

function populateCatSelect() {
  const sec = document.getElementById("new-section").value;
  const sel = document.getElementById("new-cat");
  sel.innerHTML = `<option value="">— pick —</option>`;
  CATS[sec].forEach(c => {
    const o = document.createElement("option");
    o.value = c; o.textContent = c;
    sel.appendChild(o);
  });
  updateFilterCats();
}

function updateFilterCats() {
  const sec = document.getElementById("filter-section").value;
  const sel = document.getElementById("filter-cat");
  const prev = sel.value;
  sel.innerHTML = `<option value="all">All categories</option>`;
  const cats = sec === "all"
    ? [...new Set(Object.values(CATS).flat())]
    : (CATS[sec] || []);
  cats.forEach(c => {
    const o = document.createElement("option");
    o.value = c; o.textContent = c;
    sel.appendChild(o);
  });
  if ([...sel.options].some(o => o.value === prev)) sel.value = prev;
}

function addError() {
  const sec = document.getElementById("new-section").value;
  const cat = document.getElementById("new-cat").value;
  const note = document.getElementById("new-note").value.trim();
  if (!cat || !note) {
    // Shake the form gently — DaisyUI doesn't have a built-in, just alert
    if (!cat) document.getElementById("new-cat").focus();
    else document.getElementById("new-note").focus();
    return;
  }
  appState.errors.push({
    id: Date.now(),
    sec, cat, note,
    date: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })
  });
  document.getElementById("new-note").value = "";
  saveState();
  renderErrors();
}

function deleteError(id) {
  appState.errors = appState.errors.filter(e => e.id !== id);
  saveState();
  renderErrors();
}

function clearAllErrors() {
  if (!confirm("Clear all logged errors?")) return;
  appState.errors = [];
  saveState();
  renderErrors();
}

function renderErrors() {
  const secF = document.getElementById("filter-section").value;
  const catF = document.getElementById("filter-cat").value;
  const list = document.getElementById("err-list");

  const filtered = appState.errors.filter(e =>
    (secF === "all" || e.sec === secF) &&
    (catF === "all" || e.cat === catF)
  );

  if (!filtered.length) {
    list.innerHTML = `<div class="text-center py-10 text-base-content/40 text-sm">No errors logged yet — add one above.</div>`;
  } else {
    list.innerHTML = "";
    [...filtered].reverse().forEach(e => {
      const div = document.createElement("div");
      div.className = "card bg-base-100 border border-base-300 rounded-xl";
      div.innerHTML = `
        <div class="card-body p-4">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="badge ${BADGE_CLASS[e.sec]} badge-sm capitalize">${e.sec}</span>
            <span class="text-sm text-base-content/60">${e.cat}</span>
            <span class="text-xs text-base-content/40 ml-auto">${e.date}</span>
            <button class="btn btn-ghost btn-xs text-error" onclick="deleteError(${e.id})">✕</button>
          </div>
          <p class="text-sm mt-1">${escHtml(e.note)}</p>
        </div>`;
      list.appendChild(div);
    });
  }

  renderHeatmap();
}

function escHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function renderHeatmap() {
  const grid = document.getElementById("heat-grid");
  grid.innerHTML = "";
  const secs = ["reading", "english", "math"];

  secs.forEach(sec => {
    const counts = {};
    appState.errors.filter(e => e.sec === sec).forEach(e => {
      counts[e.cat] = (counts[e.cat] || 0) + 1;
    });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const maxC = sorted.length ? sorted[0][1] : 1;

    const card = document.createElement("div");
    card.className = "card bg-base-200 rounded-xl";
    let inner = `<div class="card-body p-4">
      <h3 class="card-title text-sm capitalize mb-3">${sec}</h3>`;

    if (!sorted.length) {
      inner += `<p class="text-xs text-base-content/40">No errors yet</p>`;
    } else {
      sorted.forEach(([cat, n]) => {
        const pct = Math.round(n / maxC * 100);
        inner += `
          <div class="mb-2">
            <div class="flex justify-between text-xs mb-1">
              <span>${cat}</span>
              <span class="font-medium">${n}</span>
            </div>
            <progress class="progress ${BAR_COLOR[sec].replace("bg-", "progress-")} h-1.5 w-full" value="${pct}" max="100"></progress>
          </div>`;
      });
    }

    inner += `</div>`;
    card.innerHTML = inner;
    grid.appendChild(card);
  });
}

// ── Init ───────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  populateCatSelect();
  renderGrid();
});
