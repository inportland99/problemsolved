// =============================================================================
// ACT Math Practice Engine
// =============================================================================
//
// CONFIGURATION
// -------------
// To restrict access to specific passphrases, add their SHA-256 hashes to
// VALID_USER_HASHES below. Leave the array empty to allow any passphrase.
//
// To compute a hash for a passphrase, run this in the browser console:
//   crypto.subtle.digest('SHA-256', new TextEncoder().encode('yourpassphrase'))
//     .then(b => console.log([...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')))
//
const VALID_USER_HASHES = [
  'c824295be9a067f7648aec666168165d6deabdf0d49f455be6c05cfc74f70b64'
  // Example: 'abc123...'
];

const PROBLEMS_PER_SESSION = 20;
const TABLE_NAME = 'act_progress';

// =============================================================================
// State
// =============================================================================
let db = null;
let userId = null;
let progressMap = {};       // problemId → row from Supabase
let sessionQueue = [];      // [{template, instance}, ...] — grows as wrong answers are recycled
let queueIndex = 0;         // current position in sessionQueue
let correctCount = 0;       // number of correct answers this session
let sessionResults = [];    // all answers, including retries
let sessionStartTime = null;
let sessionEndTime = null;
let currentHint1Used = false;
let currentHint2Used = false;

// =============================================================================
// Boot — wait for KaTeX + Supabase before starting
// =============================================================================
window._appReady = false;
window._startApp = startApp;

window.addEventListener('load', () => {
  window._appReady = true;
  if (window._katexReady && window._supabaseReady) startApp();
  else if (!window._katexReady) {
    // Fallback: poll for KaTeX (should have loaded via defer)
    const t = setInterval(() => {
      if (window.katex && window.renderMathInElement && window._supabaseClient) {
        clearInterval(t);
        startApp();
      }
    }, 50);
  }
});

function startApp() {
  db = window._supabaseClient;
  wireEvents();

  // Auto-login from localStorage — go straight to home screen
  const saved = localStorage.getItem('act_user_id');
  if (saved) {
    userId = saved;
    showScreen('home');
  } else {
    showScreen('login');
  }
}

// =============================================================================
// Event wiring
// =============================================================================
function wireEvents() {
  // Login
  document.getElementById('login-btn').addEventListener('click', handleLogin);
  document.getElementById('passphrase-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleLogin();
  });
  // Home
  document.getElementById('start-btn').addEventListener('click', () => launchSession());
  document.getElementById('home-history-btn').addEventListener('click', () => loadAndShowHistory());
  document.getElementById('home-logout-btn').addEventListener('click', () => {
    localStorage.removeItem('act_user_id');
    userId = null;
    showScreen('login');
  });
  // Session
  document.getElementById('next-btn').addEventListener('click', handleNext);
  document.getElementById('hint1-btn').addEventListener('click', handleHint1);
  document.getElementById('hint2-btn').addEventListener('click', handleHint2);
  // Summary
  document.getElementById('print-btn').addEventListener('click', () => window.print());
  document.getElementById('done-btn').addEventListener('click', () => showScreen('home'));
  // All-done
  document.getElementById('done-history-btn').addEventListener('click', () => loadAndShowHistory());
  document.getElementById('done-home-btn').addEventListener('click', () => showScreen('home'));
  // History
  document.getElementById('history-back-btn').addEventListener('click', () => showScreen('home'));
}

// =============================================================================
// Auth
// =============================================================================
async function handleLogin() {
  const passphrase = document.getElementById('passphrase-input').value.trim();
  if (!passphrase) return;

  setBtnLoading(true);
  document.getElementById('login-error').classList.add('hidden');

  const hash = await hashPassphrase(passphrase);

  if (VALID_USER_HASHES.length > 0 && !VALID_USER_HASHES.includes(hash)) {
    document.getElementById('login-error').classList.remove('hidden');
    setBtnLoading(false);
    return;
  }

  userId = hash;
  localStorage.setItem('act_user_id', userId);
  setBtnLoading(false);
  showScreen('home');
}

async function hashPassphrase(passphrase) {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(passphrase.toLowerCase()));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function setBtnLoading(on) {
  document.getElementById('login-btn-text').classList.toggle('hidden', on);
  document.getElementById('login-spinner').classList.toggle('hidden', !on);
}

// =============================================================================
// Session launch
// =============================================================================
async function launchSession() {
  showScreen('loading');

  try {
    await loadProgress();

    const today = todayStr();
    const allProblems = window.ACT_PROBLEMS || [];

    // Separate into due (review due today or overdue) and new (never seen)
    const due = [];
    const fresh = [];
    for (const p of allProblems) {
      const prog = progressMap[p.id];
      if (!prog) {
        fresh.push(p);
      } else if (prog.next_review_date <= today) {
        due.push(p);
      }
    }

    shuffle(due);
    shuffle(fresh);

    const selected = [...due, ...fresh].slice(0, PROBLEMS_PER_SESSION);

    if (selected.length === 0) {
      const nextDue = nextReviewDate();
      const el = document.getElementById('done-next-count');
      el.textContent = nextDue ? `Next problems due: ${nextDue}` : '';
      showScreen('done');
      return;
    }

    // Restore an interrupted session from today (refresh recovery)
    if (tryRestoreSession()) return;

    // One session per day — if already completed today, show done screen
    const lastDone = localStorage.getItem('act_last_session_date');
    if (lastDone === today) {
      const nextDue = nextReviewDate();
      document.getElementById('done-next-count').textContent =
        nextDue ? `Next problems due: ${nextDue}` : '';
      showScreen('done');
      return;
    }

    // Initialize session queue; wrong answers will be recycled back in
    sessionQueue = selected.map(tmpl => ({
      template: tmpl,
      instance: generateInstance(tmpl)
    }));
    queueIndex = 0;
    correctCount = 0;
    sessionResults = [];

    showScreen('session');
    renderQuestion();
  } catch (err) {
    console.error('Session error:', err);
    alert('Something went wrong loading your session. Please refresh and try again.');
    showScreen('login');
    localStorage.removeItem('act_user_id');
  }
}

// =============================================================================
// Progress — Supabase
// =============================================================================
async function loadProgress() {
  const { data, error } = await db
    .from(TABLE_NAME)
    .select('*')
    .eq('user_id', userId);

  if (error) throw error;

  progressMap = {};
  for (const row of data || []) {
    progressMap[row.problem_id] = row;
  }
}

async function saveProgress() {
  const today = todayStr();

  // Process results sequentially — chains SM-2 correctly for retried problems
  // (wrong → resets to 1 day; then right → doubles from there)
  const progressState = new Map();
  sessionResults.forEach(({ problemId, correct }) => {
    const base = progressState.get(problemId)
      || progressMap[problemId]
      || { interval_days: 1, ease_factor: 2.0, times_correct: 0, times_wrong: 0 };
    progressState.set(problemId, smUpdate(base, correct, today));
  });

  const rows = [...progressState.entries()].map(([problemId, state]) => ({
    user_id: userId,
    problem_id: problemId,
    interval_days: state.interval_days,
    ease_factor: state.ease_factor,
    next_review_date: state.next_review_date,
    times_correct: state.times_correct,
    times_wrong: state.times_wrong,
    last_reviewed: new Date().toISOString()
  }));

  const { error } = await db
    .from(TABLE_NAME)
    .upsert(rows, { onConflict: 'user_id,problem_id' });

  if (error) console.error('Save error:', error);
}

// =============================================================================
// Spaced Repetition — simplified SM-2
// =============================================================================
function smUpdate(rec, correct, today) {
  // Fixed 2× interval doubling on correct; reset to 1 day on wrong
  if (correct) {
    const interval = Math.max(1, Math.floor(rec.interval_days * 2.0));
    return {
      interval_days: interval,
      ease_factor: 2.0,
      next_review_date: addDays(today, interval),
      times_correct: (rec.times_correct || 0) + 1,
      times_wrong: rec.times_wrong || 0
    };
  } else {
    return {
      interval_days: 1,
      ease_factor: 2.0,
      next_review_date: addDays(today, 1),
      times_correct: rec.times_correct || 0,
      times_wrong: (rec.times_wrong || 0) + 1
    };
  }
}

// =============================================================================
// Problem generation
// =============================================================================
function generateInstance(tmpl) {
  // If the problem defines multiple scenarios, pick one at random;
  // spread it over the base template so id/topic/difficulty are preserved.
  const eff = tmpl.scenarios
    ? { ...tmpl, ...tmpl.scenarios[Math.floor(Math.random() * tmpl.scenarios.length)] }
    : tmpl;

  let params = {};
  let attempts = 0;

  // Retry until validate passes (or 200 attempts)
  do {
    params = {};
    for (const [name, spec] of Object.entries(eff.params || {})) {
      params[name] = sampleParam(spec);
    }
    for (const [name, expr] of Object.entries(eff.derived || {})) {
      params[name] = safeEval(expr, params);
    }
    attempts++;
  } while (
    attempts < 200 &&
    eff.validate &&
    !safeEval(eff.validate, params)
  );

  // Fill template text
  const question = fillTemplate(eff.template, params);

  // Compute correct answer
  const answerVal = safeEval(eff.answerExpr, params);
  const fmt = eff.answerFormat || 'integer';
  const correctStr = formatValue(answerVal, fmt);

  // Compute distractors
  let distractors = (eff.distractorExprs || [])
    .map(expr => {
      const v = safeEval(expr, params);
      return formatValue(v, fmt);
    })
    .filter(d => d && d !== correctStr && d !== '?' && !d.includes('Infinity') && d !== 'NaN');

  // De-duplicate
  distractors = [...new Set(distractors)];

  // Pad to 4 if needed
  let pad = 1;
  while (distractors.length < 4 && pad < 30) {
    const fb = formatValue(answerVal + pad, fmt);
    if (fb !== correctStr && !distractors.includes(fb)) distractors.push(fb);
    const fb2 = formatValue(answerVal - pad, fmt);
    if (distractors.length < 4 && fb2 !== correctStr && !distractors.includes(fb2)) distractors.push(fb2);
    pad++;
  }

  // Build 5 choices and shuffle
  const choices = [correctStr, ...distractors.slice(0, 4)];
  shuffle(choices);

  return {
    question,
    choices,
    correctIndex: choices.indexOf(correctStr),
    correctStr
  };
}

function sampleParam(spec) {
  if (Array.isArray(spec.values)) {
    return spec.values[Math.floor(Math.random() * spec.values.length)];
  }
  if (spec.type === 'int') {
    return spec.min + Math.floor(Math.random() * (spec.max - spec.min + 1));
  }
  return spec.min + Math.random() * (spec.max - spec.min);
}

function safeEval(expr, params) {
  try {
    const names = Object.keys(params);
    const vals = Object.values(params);
    // eslint-disable-next-line no-new-func
    return new Function(...names, `"use strict"; return (${expr});`)(...vals);
  } catch {
    return 0;
  }
}

function fillTemplate(template, params) {
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    const v = params[key];
    return v !== undefined ? v : `{${key}}`;
  });
}

// =============================================================================
// Answer formatting
// =============================================================================
function formatValue(val, format) {
  if (val === null || val === undefined || (typeof val === 'number' && !isFinite(val))) return '?';
  switch (format) {
    case 'fraction':        return formatFraction(val);
    case 'pi-coefficient':  return formatPiCoeff(val);
    case 'decimal2':        return Number(val).toFixed(2);
    case 'decimal1':        return Number(val).toFixed(1);
    case 'percent':         return `${Math.round(val)}\\%`;
    default:                return String(Math.round(val));
  }
}

function formatFraction(x) {
  const eps = 1e-9;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  if (Math.abs(x - Math.round(x)) < eps) return String(sign * Math.round(x));

  let bestN = 1, bestD = 2, bestErr = 1;
  for (let d = 2; d <= 200; d++) {
    const n = Math.round(x * d);
    const err = Math.abs(n / d - x);
    if (err < bestErr) { bestErr = err; bestN = n; bestD = d; }
    if (err < eps) break;
  }
  const g = gcd(bestN, bestD);
  const n = (sign * bestN) / g;
  const d = bestD / g;
  if (d === 1) return String(n);
  if (n < 0) return `-\\frac{${Math.abs(n)}}{${d}}`;
  return `\\frac{${n}}{${d}}`;
}

function formatPiCoeff(val) {
  const n = Math.round(val);
  if (n === 1) return '\\pi';
  if (n === -1) return '-\\pi';
  return `${n}\\pi`;
}

function gcd(a, b) { return b === 0 ? Math.abs(a) : gcd(b, Math.abs(a % b)); }

// =============================================================================
// Rendering
// =============================================================================
function renderQuestion() {
  const { template, instance } = sessionQueue[queueIndex];

  // Progress: counts correct answers toward goal of 20
  document.getElementById('session-counter').textContent = `${correctCount} / 20 correct`;
  document.getElementById('session-progress').value = correctCount;
  document.getElementById('session-progress').max = 20;

  // Start timer on first question
  if (queueIndex === 0) sessionStartTime = Date.now();

  // Reset hint state
  currentHint1Used = false;
  currentHint2Used = false;
  document.getElementById('hint1-content').classList.add('hidden');
  document.getElementById('hint2-btn').classList.add('hidden');
  document.getElementById('hint2-content').classList.add('hidden');
  document.getElementById('hint-area').classList.remove('hidden');

  // Question text with KaTeX
  const qEl = document.getElementById('question-text');
  qEl.innerHTML = instance.question;
  if (window.renderMathInElement) {
    renderMathInElement(qEl, {
      delimiters: [
        { left: '\\(', right: '\\)', display: false },
        { left: '\\[', right: '\\]', display: true }
      ],
      throwOnError: false
    });
  }

  // Choices
  const container = document.getElementById('choices-container');
  container.innerHTML = '';
  instance.choices.forEach((choice, i) => {
    const label = 'ABCDE'[i];
    const btn = document.createElement('button');
    btn.className = 'btn btn-outline justify-start text-left h-auto py-3 px-4 w-full font-normal';
    btn.dataset.index = i;

    const labelEl = document.createElement('span');
    labelEl.className = 'font-bold text-primary min-w-[1.5rem] shrink-0 mr-3';
    labelEl.textContent = label;

    const mathEl = document.createElement('span');
    mathEl.className = 'choice-math';
    mathEl.innerHTML = renderMathString(choice);

    btn.appendChild(labelEl);
    btn.appendChild(mathEl);
    btn.addEventListener('click', () => handleAnswer(i));
    container.appendChild(btn);
  });

  // Hide feedback
  document.getElementById('feedback-area').classList.add('hidden');
  document.getElementById('feedback-area').className =
    'hidden mt-5 card border-2';
}

function renderMathString(str) {
  if (!str) return '';
  if (str.includes('\\') && window.katex) {
    try {
      return katex.renderToString(str, { throwOnError: false, displayMode: false });
    } catch { /* fall through */ }
  }
  return escapeHtml(String(str));
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// =============================================================================
// Answer handling
// =============================================================================
function handleAnswer(choiceIndex) {
  const { template, instance } = sessionQueue[queueIndex];
  const correct = choiceIndex === instance.correctIndex;

  sessionResults.push({
    problemId: template.id,
    topic: template.topic,
    correct,
    question: instance.question,
    choices: instance.choices,
    selectedIndex: choiceIndex,
    correctIndex: instance.correctIndex,
    hint1Used: currentHint1Used,
    hint2Used: currentHint2Used
  });

  // Track correctCount; recycle wrong problems
  if (correct) {
    correctCount++;
  } else {
    // Add a fresh instance of this problem back to the end of the queue
    sessionQueue.push({ template, instance: generateInstance(template) });
  }

  // Persist state so a page refresh can resume here
  saveSessionState();

  // Hide hints while feedback is shown
  document.getElementById('hint-area').classList.add('hidden');

  // Style buttons
  const buttons = document.querySelectorAll('#choices-container button');
  buttons.forEach((btn, i) => {
    btn.disabled = true;
    if (i === instance.correctIndex) {
      btn.classList.remove('btn-outline');
      btn.classList.add('btn-success', 'text-white');
    } else if (i === choiceIndex && !correct) {
      btn.classList.remove('btn-outline');
      btn.classList.add('btn-error', 'text-white');
    }
  });

  // Feedback
  const area = document.getElementById('feedback-area');
  area.classList.remove('hidden', 'border-success', 'border-error', 'bg-success/10', 'bg-error/10');

  if (correct) {
    area.classList.add('border-success', 'bg-success/10');
    document.getElementById('feedback-message').innerHTML =
      '<span class="text-success">✓ Correct!</span>';
    document.getElementById('feedback-correct-wrap').classList.add('hidden');
  } else {
    area.classList.add('border-error', 'bg-error/10');
    document.getElementById('feedback-message').innerHTML =
      '<span class="text-error">✗ Incorrect</span>';
    const correctLabel = 'ABCDE'[instance.correctIndex];
    document.getElementById('feedback-correct-label').textContent = `${correctLabel} —`;
    document.getElementById('feedback-correct-math').innerHTML =
      renderMathString(instance.correctStr);
    document.getElementById('feedback-correct-wrap').classList.remove('hidden');
  }
}

// =============================================================================
// Next / session end
// =============================================================================
async function handleNext() {
  // End session when she has 20 correct answers
  if (correctCount >= 20) {
    await finishSession();
    return;
  }
  queueIndex++;
  if (queueIndex >= sessionQueue.length) {
    // Edge case: ran out of problems before 20 correct
    await finishSession();
    return;
  }
  renderQuestion();
}

async function finishSession() {
  sessionEndTime = Date.now();
  showScreen('loading');
  await saveProgress();

  const totalAttempts = sessionResults.length;
  const elapsed = Math.round((sessionEndTime - sessionStartTime) / 1000);

  // Unique problems she got wrong at any point → come back tomorrow
  const uniqueWrong = new Set(
    sessionResults.filter(r => !r.correct).map(r => r.problemId)
  ).size;

  document.getElementById('summary-score').textContent = `${correctCount}/20`;
  document.getElementById('summary-correct').textContent = totalAttempts;
  document.getElementById('summary-tomorrow').textContent = uniqueWrong;
  document.getElementById('summary-time').textContent = formatTime(elapsed);
  document.getElementById('summary-encouragement').textContent =
    encouragement(correctCount, totalAttempts);

  buildPrintReport(sessionResults, elapsed, correctCount, totalAttempts);
  await saveSession(sessionResults, elapsed, correctCount, totalAttempts);

  // Clear in-progress state and mark today as done
  localStorage.removeItem('act_session_state');
  localStorage.setItem('act_last_session_date', todayStr());

  showScreen('summary');
}

// =============================================================================
// Session persistence (refresh recovery)
// =============================================================================
function saveSessionState() {
  if (!userId || sessionQueue.length === 0) return;
  try {
    localStorage.setItem('act_session_state', JSON.stringify({
      date:             todayStr(),
      userId,
      queueIndex,
      correctCount,
      sessionStartTime: sessionStartTime || Date.now(),
      sessionResults,
      queue: sessionQueue.map(item => ({
        templateId: item.template.id,
        instance:   item.instance   // {question, choices, correctIndex, correctStr}
      }))
    }));
  } catch { /* localStorage full — ignore */ }
}

function tryRestoreSession() {
  const raw = localStorage.getItem('act_session_state');
  if (!raw) return false;
  try {
    const state = JSON.parse(raw);

    // Stale if different user, different day, or already finished today
    if (
      state.userId !== userId ||
      state.date !== todayStr() ||
      localStorage.getItem('act_last_session_date') === todayStr()
    ) {
      localStorage.removeItem('act_session_state');
      return false;
    }

    const problemMap = new Map((window.ACT_PROBLEMS || []).map(p => [p.id, p]));
    const restored = (state.queue || [])
      .map(item => {
        const tmpl = problemMap.get(item.templateId);
        return tmpl ? { template: tmpl, instance: item.instance } : null;
      })
      .filter(Boolean);

    if (restored.length === 0 || state.queueIndex >= restored.length) {
      localStorage.removeItem('act_session_state');
      return false;
    }

    sessionQueue     = restored;
    queueIndex       = state.queueIndex;
    correctCount     = state.correctCount  || 0;
    sessionStartTime = state.sessionStartTime || Date.now();
    sessionResults   = state.sessionResults  || [];

    showScreen('session');
    renderQuestion();
    return true;
  } catch {
    localStorage.removeItem('act_session_state');
    return false;
  }
}

// =============================================================================
// Session history — Supabase
// =============================================================================
const SESSION_TABLE = 'act_sessions';

async function saveSession(results, elapsed, correct, total) {
  // Trim choices/question strings to keep JSONB compact
  const payload = results.map(r => ({
    problemId:     r.problemId,
    topic:         r.topic,
    correct:       r.correct,
    question:      r.question,
    choices:       r.choices,
    selectedIndex: r.selectedIndex,
    correctIndex:  r.correctIndex,
    hint1Used:     r.hint1Used || false,
    hint2Used:     r.hint2Used || false
  }));

  const { error } = await db
    .from(SESSION_TABLE)
    .insert({
      user_id:          userId,
      session_date:     todayStr(),
      duration_seconds: elapsed,
      score_correct:    correct,
      score_total:      total,
      problems:         payload
    });

  if (error) console.error('Error saving session:', error);
}

async function loadAndShowHistory() {
  showScreen('history');
  document.getElementById('history-loading').classList.remove('hidden');
  document.getElementById('history-list').classList.add('hidden');
  document.getElementById('history-empty').classList.add('hidden');

  const { data, error } = await db
    .from(SESSION_TABLE)
    .select('id, session_date, duration_seconds, score_correct, score_total, problems, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  document.getElementById('history-loading').classList.add('hidden');

  if (error || !data || data.length === 0) {
    document.getElementById('history-empty').classList.remove('hidden');
    return;
  }

  renderHistoryList(data);
}

function renderHistoryList(sessions) {
  const container = document.getElementById('history-list');
  container.innerHTML = '';

  sessions.forEach((session, idx) => {
    const dateStr = new Date(session.session_date + 'T12:00:00').toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
    });
    const pct      = session.score_total > 0
      ? Math.round((session.score_correct / session.score_total) * 100) : 0;
    const badgeCls = pct >= 80 ? 'badge-success' : pct >= 60 ? 'badge-warning' : 'badge-error';

    const div = document.createElement('div');
    div.className = 'card bg-base-100 shadow';
    div.innerHTML = `
      <div class="card-body py-4 px-5">
        <div class="flex items-center gap-3 flex-wrap">
          <div class="flex-1 min-w-0">
            <div class="font-semibold text-sm">${escapeHtml(dateStr)}</div>
            <div class="text-xs text-base-content/60 mt-0.5">
              ${session.score_correct}/${session.score_total} correct
              &nbsp;&middot;&nbsp; ${formatTime(session.duration_seconds || 0)}
            </div>
          </div>
          <span class="badge ${badgeCls} shrink-0">${pct}%</span>
          <button class="btn btn-outline btn-sm shrink-0 hist-print-btn" data-idx="${idx}">
            &#128424; Print
          </button>
        </div>
      </div>`;
    container.appendChild(div);
  });

  container.querySelectorAll('.hist-print-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const s = sessions[parseInt(btn.dataset.idx)];
      buildPrintReport(
        s.problems || [], s.duration_seconds || 0,
        s.score_correct, s.score_total, s.session_date
      );
      window.print();
    });
  });

  container.classList.remove('hidden');
}

// =============================================================================
// Hints
// =============================================================================
function handleHint1() {
  if (currentHint1Used) return; // already shown
  currentHint1Used = true;

  const { template } = sessionQueue[queueIndex];

  document.getElementById('hint1-topic').textContent = template.topic;
  document.getElementById('hint1-content').classList.remove('hidden');
  document.getElementById('hint2-btn').classList.remove('hidden');
}

function handleHint2() {
  if (currentHint2Used) return; // already shown
  currentHint2Used = true;

  const { template } = sessionQueue[queueIndex];

  // Generate a fresh instance of the same problem type
  const ex = generateInstance(template);

  // Render the example question
  const qEl = document.getElementById('hint2-question');
  qEl.innerHTML = ex.question;
  if (window.renderMathInElement) {
    renderMathInElement(qEl, {
      delimiters: [
        { left: '\\(', right: '\\)', display: false },
        { left: '\\[', right: '\\]', display: true }
      ],
      throwOnError: false
    });
  }

  document.getElementById('hint2-answer').innerHTML =
    renderMathString(ex.choices[ex.correctIndex]);
  document.getElementById('hint2-content').classList.remove('hidden');
}

// =============================================================================
// Timer
// =============================================================================
function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// =============================================================================
// Print Report
// =============================================================================
function renderMathInString(str) {
  if (!str || !window.katex) return escapeHtml(str || '');
  // Replace \( ... \) inline math
  let out = str.replace(/\\\((.+?)\\\)/gs, (_, math) => {
    try { return katex.renderToString(math, { throwOnError: false, displayMode: false }); }
    catch { return math; }
  });
  // Replace \[ ... \] display math
  out = out.replace(/\\\[(.+?)\\\]/gs, (_, math) => {
    try { return katex.renderToString(math, { throwOnError: false, displayMode: true }); }
    catch { return math; }
  });
  return out;
}

function buildPrintReport(results, elapsed, correct, total, sessionDateStr) {
  const dateObj = sessionDateStr ? new Date(sessionDateStr + 'T12:00:00') : new Date();
  const date = dateObj.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });
  const pct = total > 0 ? Math.round((correct / total) * 100) : 0;

  let html = `
    <div class="pr-header">
      <h1>ACT Math Practice Report</h1>
      <p>${escapeHtml(date)} &nbsp;|&nbsp; Time: ${formatTime(elapsed)} &nbsp;|&nbsp; Score: ${correct}/${total} (${pct}%)</p>
    </div>
    <div class="pr-problems">
  `;

  results.forEach((r, i) => {
    const cls  = r.correct ? 'correct' : 'wrong';
    const icon = r.correct
      ? '<span class="pr-result ok">&#10003; Correct</span>'
      : '<span class="pr-result bad">&#10007; Wrong</span>';
    const hintBadge = r.hint2Used
      ? '<span class="pr-hint">&#128161; type + example hints used</span>'
      : r.hint1Used
      ? '<span class="pr-hint">&#128161; type hint used</span>'
      : '';

    const choicesHtml = r.choices.map((choice, ci) => {
      const label = 'ABCDE'[ci];
      const isCorrect  = ci === r.correctIndex;
      const isSelected = ci === r.selectedIndex;

      let choiceCls = 'pr-choice';
      if (isSelected &&  r.correct)  choiceCls += ' selected-correct';
      if (isSelected && !r.correct)  choiceCls += ' selected-wrong';
      if (!isSelected && isCorrect)  choiceCls += ' correct-answer';

      let marker = '';
      if (isSelected &&  r.correct) marker = ' &#10003;';
      if (isSelected && !r.correct) marker = ' &#10007;';
      if (!isSelected && isCorrect && !r.correct) marker = ' &#8592; correct';

      return `<div class="${choiceCls}">
        <span class="pr-choice-label">${label}.</span>
        <span class="pr-choice-text">${renderMathString(choice)}${marker}</span>
      </div>`;
    }).join('');

    html += `
      <div class="pr-problem ${cls}">
        <div class="pr-meta">
          <span class="pr-num">${i + 1}.</span>
          <span class="pr-topic">${escapeHtml(r.topic)}</span>
          ${icon}
        </div>
        ${hintBadge}
        <div class="pr-question">${renderMathInString(r.question)}</div>
        <div class="pr-choices">${choicesHtml}</div>
      </div>
    `;
  });

  html += '</div>';
  document.getElementById('print-report').innerHTML = html;
}

// =============================================================================
// Utilities
// =============================================================================
function showScreen(name) {
  ['login', 'home', 'loading', 'session', 'summary', 'done', 'history'].forEach(id => {
    document.getElementById(`screen-${id}`).classList.toggle('hidden', id !== name);
  });
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function todayStr() {
  // Use Eastern Time so the day resets at midnight ET, not midnight UTC
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

function nextReviewDate() {
  // Find earliest next_review_date among all progress records
  const dates = Object.values(progressMap)
    .map(r => r.next_review_date)
    .filter(Boolean)
    .sort();
  return dates[0] || null;
}

function encouragement(correct, total) {
  const pct = total > 0 ? correct / total : 0;
  if (pct === 1)   return 'Perfect score! Incredible work! 🌟';
  if (pct >= 0.9)  return 'Excellent — almost flawless!';
  if (pct >= 0.75) return 'Great job! You\'re making real progress.';
  if (pct >= 0.6)  return 'Good effort! Keep at it.';
  return 'Keep practicing — every session makes you stronger!';
}
