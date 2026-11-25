import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  DICE, rollBoard, renderBoard, timerStep, buildTrie, solveBoard, hardestWords,
  REVEAL_WIDTH, REVEAL_TITLE, RULE_LINES, TIMER_TILES, TIMER_STAGES, STEP_MS, FINAL_STEP, displayCharacter,
} from '../src/assets/js/vestaboard-boggle/game.mjs';
import { createHandler, zonedNow } from '../supabase/functions/vestaboard-send/handler.mjs';
import { finishWordsForBoard } from '../supabase/functions/vestaboard-send/finish.mjs';

test('all sixteen supplied dice retain their six faces and multiplicities', () => {
  assert.deepEqual(DICE, [
    'AAEEGN', 'ABBJOO', 'ACHOPS', 'AFFKPS', 'AOOTTW', 'CIMOTU', 'DEILRX', 'DELRVY',
    'DISTTY', 'EEGHNW', 'EEINSU', 'EHRTVW', 'EIOSST', 'ELRTTY', 'HIMNUQ', 'HLNNRZ',
  ]);
  assert.equal(new Set(DICE).size, 16);
  const calls = [];
  const board = rollBoard(() => { calls.push(0); return 0; });
  const expected = DICE.map(die => die[0]);
  // All-zero Fisher–Yates rotates this particular input left one place.
  assert.deepEqual(board, [...expected.slice(1), expected[0]]);
  assert.equal(calls.length, 31);
  assert.ok(rollBoard(() => 0.999).includes('Q'));
});

test('a worker resuming after its write lease expires never sends', async () => {
  const f = fixture({ claim: {
    token: ITEM, leaseUntil: '2000-01-01T00:00:00Z', round: { id: ROUND, board: BOARD }, step: 1,
  } });
  assert.equal((await f.request({ action: 'game-tick' }, { 'X-Cron-Secret': 'test-worker-secret' })).status, 500);
  assert.equal(f.sends.length, 0);
});

test('eight 22.5-second stages shrink the sixteen-tile bar; finish flips all black', () => {
  const board = rollBoard(() => 0.5);
  const start = '2026-01-01T00:00:00.000Z';
  assert.equal(STEP_MS, 22500);
  for (let stage = 0; stage <= TIMER_STAGES; stage++) {
    const step = stage === TIMER_STAGES ? FINAL_STEP : stage;
    const ms = Date.parse(start) + stage * STEP_MS;
    assert.equal(timerStep(start, ms), step);
    if (stage) assert.equal(timerStep(start, ms - 1), stage - 1);
    const grid = renderBoard(board, step);
    assert.equal(grid.length, 6);
    assert.ok(grid.every(row => row.length === 22));
    assert.deepEqual(grid.map(row => row.slice(16)), renderBoard(board).map(row => row.slice(16)), 'frame and letters never change');
    assert.equal(grid[5].filter(x => x === 63).length, step === FINAL_STEP ? 0 : step * 2);
    assert.equal(grid[5].filter(x => x === 66).length, step === FINAL_STEP ? 0 : TIMER_TILES - step * 2);
    assert.equal(grid[5].filter(x => x === 70).length, step === FINAL_STEP ? TIMER_TILES : 0);
    const bar = grid[5].slice(0, TIMER_TILES);
    assert.deepEqual(bar, [...bar].reverse(), 'the bar shrinks symmetrically');
    if (step !== FINAL_STEP) {
      assert.deepEqual(bar.slice(0, step), Array(step).fill(63));
      assert.deepEqual(bar.slice(step, TIMER_TILES - step), Array(TIMER_TILES - step * 2).fill(66));
      assert.deepEqual(bar.slice(TIMER_TILES - step), Array(step).fill(63));
    }
  }
  assert.equal(timerStep(start, Date.parse(start) - 100), 0);
  assert.equal(timerStep(start, Date.parse(start) + 999999), 9);
  assert.equal(timerStep(null), 0);
  assert.throws(() => renderBoard(['A']));
  assert.throws(() => renderBoard(board, 10));
});

test('physical layout matches the orange six-column frame and compact letters in the image', () => {
  const board = 'ABCDEFGHIJKLMNOP'.split('');
  const grid = renderBoard(board);
  for (let row = 0; row < 6; row++) {
    for (let col = 16; col < 22; col++) {
      if (row === 0 || row === 5 || col === 16 || col === 21) assert.equal(grid[row][col], 64, `orange border ${row},${col}`);
      else assert.equal(grid[row][col], board[(row - 1) * 4 + col - 17].charCodeAt(0) - 64);
    }
  }
  assert.deepEqual(grid[5].slice(0, 16), Array(16).fill(66), 'bar starts at the left edge');
});

test('play rules are centered, including supported digit and plus glyphs', () => {
  const grid = renderBoard('ABCDEFGHIJKLMNOP'.split(''));
  for (let row = 0; row < 5; row++) {
    const line = grid[row].slice(0, 16).map(code => displayCharacter(code) || ' ').join('');
    const text = RULE_LINES[row];
    assert.equal(line.trim(), text);
    assert.equal(line.indexOf(text), Math.floor((16 - text.length) / 2));
  }
  assert.equal(displayCharacter(29), '3');
  assert.equal(displayCharacter(46), '+');
  assert.equal(displayCharacter(60), '?');
  assert.equal(displayCharacter(0), '');
  assert.deepEqual(renderBoard('ABCDEFGHIJKLMNOP'.split(''), 8)[5].slice(0, 16),
    renderBoard('ABCDEFGHIJKLMNOP'.split(''), 7)[5].slice(0, 16), 'legacy step 8 never creates an all-red frame');
});

test('hardest words are longest first, alphabetically tied, unique, and never truncated', () => {
  assert.deepEqual(hardestWords(['cat', 'HOUSES', 'house', 'queen', 'HOUSE', 'bad-word', 'a', null]),
    ['HOUSES', 'HOUSE', 'QUEEN']);
  assert.deepEqual(hardestWords(['cat']), ['CAT']);
  assert.deepEqual(hardestWords([]), []);
  assert.deepEqual(hardestWords(['A'.repeat(REVEAL_WIDTH + 1), 'B'.repeat(REVEAL_WIDTH)]),
    ['B'.repeat(REVEAL_WIDTH)]);
});

test('finish reveal fits left of the intact grid and never leaks before the final frame', () => {
  const board = 'ABCDEFGHIJKLMNOP'.split('');
  const words = ['A'.repeat(REVEAL_WIDTH), 'HOUSE', 'CAT'];
  const final = renderBoard(board, 9, { finishWords: words });
  const read = row => row.slice(0, REVEAL_WIDTH).map(code => displayCharacter(code) || ' ').join('').trim();
  assert.equal(read(final[0]), REVEAL_TITLE);
  assert.deepEqual(final.slice(1, 4).map(read), words);
  [REVEAL_TITLE, ...words].forEach((text, row) => {
    const line = final[row].slice(0, 16).map(code => displayCharacter(code) || ' ').join('');
    assert.equal(line.indexOf(text), Math.floor((16 - text.length) / 2), 'finish text is centered');
  });
  assert.deepEqual(final.map(row => row.slice(16)), renderBoard(board).map(row => row.slice(16)));
  assert.deepEqual(final[5].slice(0, 16), Array(16).fill(70));
  for (let step = 0; step < 9; step++) assert.deepEqual(renderBoard(board, step, { finishWords: words }), renderBoard(board, step));
  assert.ok(renderBoard(board, 9).slice(0, 5).every(row => read(row) === ''), 'cancellation clears rules without answers');
  const empty = renderBoard(board, 9, { finishWords: [] });
  assert.equal(read(empty[2]), REVEAL_TITLE, 'title is vertically centered when there are no words');
  assert.deepEqual([0, 1, 3, 4].map(row => read(empty[row])), ['', '', '', '']);
});

test('solver permits diagonals, deduplicates, forbids wraparound and tile reuse', () => {
  const board = ['C', 'A', 'T', 'S', 'X', 'R', 'X', 'D', 'X', 'X', 'E', 'X', 'X', 'X', 'X', 'X'];
  const words = solveBoard(board, buildTrie(['cat', 'cats', 'care', 'car', 'cac', 'scat', 'ca', 'Cat', 'bad-word']));
  assert.deepEqual(words.map(x => x.word).sort(), ['CAR', 'CARE', 'CAT', 'CATS']);
  assert.deepEqual(words.find(x => x.word === 'CARE').path, [0, 1, 5, 10]);
  assert.equal(solveBoard(Array(16).fill('A'), buildTrie(['aaa', 'aaa'])).length, 1);
});

test('Q consumes QU together, counting two letters but using only one cell', () => {
  const board = ['Q', 'I', 'T', 'X', 'A', 'X', 'X', 'X', 'X', 'X', 'X', 'X', 'X', 'X', 'X', 'X'];
  const words = solveBoard(board, buildTrie(['quit', 'qua', 'qat', 'ququ']));
  assert.deepEqual(words.map(x => x.word), ['QUIT', 'QUA']);
  assert.deepEqual(words[0].path, [0, 1, 2]);
});

test('pinned dictionary is lowercase, unique, licensed and contains everyday words', async () => {
  const source = new URL('../src/assets/data/boggle/scowl-35.json', import.meta.url);
  const data = JSON.parse(await readFile(source, 'utf8'));
  assert.equal(data.version, '2020.12.07');
  assert.equal(data.size, 35);
  assert.ok(data.words.length > 30000);
  assert.ok(data.words.every(w => /^[a-z]{3,17}$/.test(w)));
  assert.equal(new Set(data.words).size, data.words.length);
  for (const word of ['cat', 'cats', 'house', 'quit', 'queen', 'tree']) assert.ok(data.words.includes(word), word);
  assert.ok(!data.words.includes('London'));
  assert.match(await readFile(new URL('../src/assets/data/boggle/SCOWL-LICENSE.txt', import.meta.url), 'utf8'), /Permission to use/);
  const suggestions = solveBoard('CATSDOGEHOUSTRIN'.split(''), buildTrie(data.words));
  for (const word of ['CAT', 'CATS', 'DOG', 'HOUSE']) assert.ok(suggestions.some(x => x.word === word), word);
  assert.deepEqual(finishWordsForBoard('CATSDOGEHOUSTRIN'.split('')), hardestWords(suggestions.map(result => result.word)));
  assert.deepEqual(finishWordsForBoard(Array(16).fill('Q')), []);
});

const USER = '10000000-0000-0000-0000-000000000001';
const ROUND = '20000000-0000-0000-0000-000000000002';
const ITEM = '30000000-0000-0000-0000-000000000003';
const BOARD = 'CATSDOGEHOUSTRIN'.split('');
const FINISH_GRID = renderBoard(BOARD, 9, { finishWords: finishWordsForBoard(BOARD) });
function fixture({ auth = true, claim, sendStatus = 200, rpcFailure, upstream = { status: 'ok' },
  upstreamRaw, readback = {}, readbackStatus = 200, itemMissing = false, schedules = [] } = {}) {
  const calls = [], sends = [], requests = [];
  const time = new Date('2026-11-24T12:00:00Z');
  const defaultClaim = { token: ITEM, leaseUntil: new Date(time.getTime() + 90000).toISOString(), round: { id: ROUND, board: BOARD }, step: 9 };
  const db = {
    rpc: async (name, params) => {
      calls.push({ name, params });
      if (name === rpcFailure) return { error: new Error('private database details') };
      return { data: name === 'boggle_start' ? { round: { id: ROUND } }
        : name === 'boggle_cancel' ? { success: true }
        : name === 'boggle_claim' ? claim || { ...defaultClaim, round: params.p_kind === 'tick' ? defaultClaim.round : null } : true };
    },
    from(table) {
      const query = {
        select() { return this; },
        update(value) { calls.push({ table, update: value }); return this; },
        eq(key, value) { calls.push({ table, key, value }); return this; },
        single: async () => ({ data: itemMissing ? null : { id: ITEM, mode: 'text', text_content: 'Hello' } }),
        then(resolve) { return Promise.resolve({ data: table === 'vestaboard_schedules' ? schedules : [] }).then(resolve); },
      };
      return query;
    },
  };
  const handler = createHandler({
    now: () => time,
    env: name => name === 'VESTABOARD_CRON_SECRET' ? 'test-worker-secret' : 'test-only',
    createClient: (_url, _key, options) => options.global ? {
      auth: { getUser: async () => ({ data: { user: auth ? { id: USER } : null } }) },
    } : db,
    fetchImpl: async (_url, options) => {
      requests.push(options);
      if (options.method === 'GET') return new Response(JSON.stringify(readback), { status: readbackStatus });
      sends.push(JSON.parse(options.body));
      return new Response(sendStatus === 204 ? null : upstreamRaw ?? JSON.stringify(upstream), { status: sendStatus });
    },
  });
  async function request(body, headers = { Authorization: 'Bearer test-user' }) {
    const response = await handler(new Request('https://test.invalid/', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
    }));
    return { status: response.status, body: await response.json() };
  }
  return { handler, request, calls, sends, requests };
}

test('all user actions require a verified JWT; worker actions require the cron secret', async () => {
  for (const action of ['start-game', 'cancel-game', 'send-now']) {
    const f = fixture({ auth: false });
    assert.equal((await f.request({ action, itemId: ITEM, roundId: ROUND })).status, 401);
    assert.equal((await f.request({ action }, {})).status, 401);
    assert.equal(f.calls.length, 0);
  }
  for (const action of ['game-tick', 'run-schedule']) {
    const f = fixture();
    assert.equal((await f.request({ action })).status, 401);
    assert.equal(f.calls.length, 0);
  }
  assert.equal((await fixture().request({ action: 'debug-key' })).status, 400);
});

test('launch persists a generated round before any physical delivery', async () => {
  const f = fixture({ claim: { skip: 'Board cooling down' } });
  assert.equal((await f.request({ action: 'start-game' })).status, 200);
  assert.deepEqual(f.calls.map(x => x.name), ['boggle_start', 'boggle_claim']);
  assert.equal(f.calls[0].params.p_user, USER);
  assert.equal(f.calls[0].params.p_board.length, 16);
  assert.equal(f.sends.length, 0);
});

test('worker sends the black finish frame and only then acknowledges success', async () => {
  const f = fixture();
  assert.equal((await f.request({ action: 'game-tick' }, { 'X-Cron-Secret': 'test-worker-secret' })).status, 200);
  assert.deepEqual(f.sends[0].characters, FINISH_GRID);
  assert.equal(f.calls.at(-1).params.p_round, ROUND);
  assert.equal(f.calls.at(-1).params.p_error, null);
});

test('cancelled rounds turn black without revealing words; running rounds never reveal them', async () => {
  for (const [step, cancel_requested] of [[9, true], [8, false]]) {
    const f = fixture({ claim: {
      token: ITEM, leaseUntil: '2026-11-24T12:01:30Z',
      round: { id: ROUND, board: BOARD, cancel_requested }, step,
    } });
    assert.equal((await f.request({ action: 'game-tick' }, { 'X-Cron-Secret': 'test-worker-secret' })).status, 200);
    assert.deepEqual(f.sends[0].characters, renderBoard(BOARD, step));
    assert.deepEqual(f.requests.map(request => request.method), ['POST'], 'bundled dictionary needs no network fetch');
  }
});

test('upstream failures remain retryable; upstream response bodies are never exposed', async () => {
  const f = fixture({ sendStatus: 429, upstream: { sensitive: 'do-not-return' } });
  const result = await f.request({ action: 'game-tick' }, { 'X-Cron-Secret': 'test-worker-secret' });
  assert.equal(result.status, 502);
  assert.match(f.calls.at(-1).params.p_error, /429/);
  assert.ok(!JSON.stringify(result).includes('do-not-return'));
  const rejected = fixture({ upstream: { status: 'error' } });
  assert.equal((await rejected.request({ action: 'game-tick' }, { 'X-Cron-Secret': 'test-worker-secret' })).status, 502);
});

test('HTTP success does not require the documentation example status field', async () => {
  for (const options of [
    { upstream: { id: ITEM, created: 123 } },
    { upstream: { status: 'success' } },
    { upstreamRaw: 'ok' },
    { sendStatus: 204 },
  ]) {
    const f = fixture(options);
    assert.equal((await f.request({ action: 'game-tick' }, { 'X-Cron-Secret': 'test-worker-secret' })).status, 200);
    assert.equal(f.calls.at(-1).params.p_error, null);
    assert.equal(f.requests.length, 1);
  }
});

test('a duplicate grid is acknowledged only when board readback matches exactly', async () => {
  for (const layout of [FINISH_GRID, JSON.stringify(FINISH_GRID)]) {
    const f = fixture({ sendStatus: 409, readback: { currentMessage: { layout } } });
    assert.equal((await f.request({ action: 'game-tick' }, { 'X-Cron-Secret': 'test-worker-secret' })).status, 200);
    assert.equal(f.calls.at(-1).params.p_error, null);
    assert.deepEqual(f.requests.map(r => r.method), ['POST', 'GET']);
    assert.equal(f.requests[0].signal, f.requests[1].signal);
  }
});

test('different, missing, malformed or inaccessible readback never turns a conflict into success', async () => {
  for (const options of [
    { readback: { currentMessage: { layout: renderBoard(BOARD, 0) } } },
    { readback: {} },
    { readback: { currentMessage: { layout: 'invalid JSON' } } },
    { readbackStatus: 503 },
  ]) {
    const f = fixture({ sendStatus: 409, ...options });
    assert.equal((await f.request({ action: 'game-tick' }, { 'X-Cron-Secret': 'test-worker-secret' })).status, 502);
    assert.match(f.calls.at(-1).params.p_error, /could not be verified/);
  }
});

test('manual sends are owner-scoped and cannot bypass the game lock', async () => {
  const f = fixture({ claim: { skip: 'Game active', gameActive: true } });
  assert.equal((await f.request({ action: 'send-now', itemId: ITEM })).status, 409);
  assert.ok(f.calls.some(x => x.table === 'vestaboard_items' && x.key === 'user_id' && x.value === USER));
  assert.equal(f.sends.length, 0);
  assert.equal((await fixture({ itemMissing: true }).request({ action: 'send-now', itemId: ITEM })).status, 404);
});

test('malformed requests fail closed and database failures do not leak details', async () => {
  const f = fixture({ rpcFailure: 'boggle_start' });
  assert.equal((await f.request({ action: 'cancel-game', roundId: 'bad' })).status, 400);
  assert.equal((await f.request({ action: 'send-now', itemId: 'bad' })).status, 400);
  const response = await f.request({ action: 'start-game' });
  assert.equal(response.status, 500);
  assert.ok(!JSON.stringify(response).includes('private database'));
  assert.equal((await f.handler(new Request('https://test.invalid/', { method: 'GET' }))).status, 405);
  assert.equal((await f.handler(new Request('https://test.invalid/', { method: 'POST', body: '{' }))).status, 400);
  assert.equal((await f.handler(new Request('https://test.invalid/', { method: 'OPTIONS' }))).status, 200);
});

test('schedule timezone handling normalizes midnight', () => {
  assert.deepEqual(zonedNow(new Date('2026-11-24T05:00:00Z'), 'America/New_York'), {
    weekday: 2, hhmm: '00:00', dateKey: '2026-11-24',
  });
});

const SCHEDULE = {
  id: ITEM, user_id: USER, item_id: ITEM, enabled: true,
  timezone: 'America/New_York', days_of_week: [2], time_of_day: '07:00:00', last_sent_at: null,
};
test('scheduled quote during a game is stamped skipped, never sent or replayed', async () => {
  const f = fixture({ schedules: [SCHEDULE], claim: { skip: 'Game active', gameActive: true } });
  const result = await f.request({ action: 'run-schedule' }, { 'X-Cron-Secret': 'test-worker-secret' });
  assert.equal(result.status, 200);
  assert.equal(result.body.results[ITEM], 'Game active');
  assert.equal(f.sends.length, 0);
  assert.ok(f.calls.some(call => call.update?.last_sent_at));
  const sentToday = fixture({ schedules: [{ ...SCHEDULE, last_sent_at: '2026-11-24T12:00:00Z' }] });
  await sentToday.request({ action: 'run-schedule' }, { 'X-Cron-Secret': 'test-worker-secret' });
  assert.equal(sentToday.sends.length, 0);
  assert.ok(!sentToday.calls.some(call => call.name === 'boggle_claim'));
});

test('scheduled and manual text sends retain their existing payload and ownership checks', async () => {
  const scheduled = fixture({ schedules: [SCHEDULE] });
  await scheduled.request({ action: 'run-schedule' }, { 'X-Cron-Secret': 'test-worker-secret' });
  assert.deepEqual(scheduled.sends, [{ text: 'Hello' }]);
  assert.ok(scheduled.calls.some(call => call.table === 'vestaboard_items' && call.key === 'user_id' && call.value === USER));
  const manual = fixture();
  assert.equal((await manual.request({ action: 'send-now', itemId: ITEM })).status, 200);
  assert.deepEqual(manual.sends, [{ text: 'Hello' }]);
  assert.equal(manual.calls.at(-1).params.p_round, null);
});
