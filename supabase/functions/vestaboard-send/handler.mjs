import { rollBoard, renderBoard } from '../../../src/assets/js/vestaboard-boggle/game.mjs';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const USER_ACTIONS = new Set(['send-now', 'start-game', 'cancel-game']);
const CRON_ACTIONS = new Set(['run-schedule', 'game-tick']);
const uuid = value => typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

export function zonedNow(date, timeZone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(date).map(part => [part.type, part.value]));
  return {
    weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday),
    hhmm: `${parts.hour === '24' ? '00' : parts.hour}:${parts.minute}`,
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

export function createHandler({ createClient, env, fetchImpl = fetch, now = () => new Date() }) {
  async function rpc(db, name, params = {}) {
    const { data, error } = await db.rpc(name, params);
    if (error) {
      console.error(`Vestaboard RPC ${name} failed`, { code: error.code || 'unknown' });
      throw new Error('Vestaboard database operation failed. Check migration and function logs.');
    }
    return data;
  }

  async function sendToBoard(item) {
    const key = env('VESTABOARD_API_KEY');
    if (!key) throw new Error('Vestaboard API is not configured.');
    let response;
    try {
      response = await fetchImpl('https://cloud.vestaboard.com/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Vestaboard-Token': key },
        body: JSON.stringify(item.mode === 'grid' ? { characters: item.grid_content } : { text: item.text_content || '' }),
        signal: AbortSignal.timeout(8000),
      });
    } catch (_) {
      throw new Error('Vestaboard connection failed or timed out.');
    }
    // Never pass upstream bodies (which may contain sensitive context) to clients.
    if (!response.ok) throw new Error(`Vestaboard rejected the message (HTTP ${response.status}).`);
    let result;
    try { result = await response.json(); } catch (_) {
      throw new Error('Vestaboard returned an unreadable response.');
    }
    if (result.status !== 'ok') throw new Error('Vestaboard did not accept the message.');
  }

  async function deliver(db, claim, item) {
    if (!Number.isFinite(Date.parse(claim.leaseUntil)) || Date.parse(claim.leaseUntil) - now().getTime() < 10000) {
      throw new Error('Write lease expired before sending; the worker will recover.');
    }
    let error = null;
    try { await sendToBoard(item); } catch (err) { error = err.message; }
    const completed = await rpc(db, 'boggle_complete', {
      p_token: claim.token, p_round: claim.round?.id || null,
      p_step: claim.step ?? null, p_error: error,
    });
    if (!completed) throw new Error('Write acknowledgement expired; reload to check the round.');
    return error;
  }

  async function tick(db) {
    const claim = await rpc(db, 'boggle_claim', { p_kind: 'tick' });
    if (!claim.token) return { success: true, skipped: claim.skip };
    const item = { mode: 'grid', grid_content: renderBoard(claim.round.board, claim.step) };
    const error = await deliver(db, claim, item);
    return error ? { error } : { success: true };
  }

  async function runSchedules(db) {
    const { data: schedules, error } = await db.from('vestaboard_schedules').select('*').eq('enabled', true);
    if (error) throw new Error('Could not read schedules.');
    const date = now();
    const results = {};
    for (const schedule of schedules || []) {
      try {
        const zoned = zonedNow(date, schedule.timezone);
        if (!schedule.days_of_week.includes(zoned.weekday) ||
            schedule.time_of_day.slice(0, 5) !== zoned.hhmm ||
            (schedule.last_sent_at && zonedNow(new Date(schedule.last_sent_at), schedule.timezone).dateKey === zoned.dateKey)) continue;
        const { data: item, error: itemError } = await db.from('vestaboard_items').select('*')
          .eq('id', schedule.item_id).eq('user_id', schedule.user_id).single();
        if (itemError || !item) { results[schedule.id] = 'Item not found'; continue; }
        const claim = await rpc(db, 'boggle_claim', { p_kind: 'schedule' });
        let stamp = false;
        if (!claim.token) {
          results[schedule.id] = claim.skip;
          stamp = !!claim.gameActive;
        } else {
          const sendError = await deliver(db, claim, item);
          results[schedule.id] = sendError || 'sent';
          stamp = !sendError;
        }
        // Game-conflicting quotes are skipped for today, not replayed later.
        if (stamp) {
          const { error: stampError } = await db.from('vestaboard_schedules')
            .update({ last_sent_at: date.toISOString() }).eq('id', schedule.id);
          if (stampError) results[schedule.id] = 'Schedule acknowledgement failed';
        }
      } catch (_) {
        results[schedule.id] = 'Schedule processing failed';
      }
    }
    return { success: true, results };
  }

  return async function handler(req) {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    let body;
    try { body = await req.json(); } catch (_) { return json({ error: 'Invalid JSON' }, 400); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'Invalid request' }, 400);
    const { action, itemId, roundId } = body;
    if (!USER_ACTIONS.has(action) && !CRON_ACTIONS.has(action)) return json({ error: 'Invalid action' }, 400);
    try {
      let user = null;
      if (CRON_ACTIONS.has(action)) {
        const expected = env('VESTABOARD_CRON_SECRET');
        if (!expected || req.headers.get('X-Cron-Secret') !== expected) return json({ error: 'Unauthorized' }, 401);
      } else {
        const authorization = req.headers.get('Authorization');
        if (!authorization?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);
        const client = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
          global: { headers: { Authorization: authorization } },
        });
        const { data, error } = await client.auth.getUser();
        if (error || !data.user) return json({ error: 'Unauthorized' }, 401);
        user = data.user;
      }
      const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      if (action === 'game-tick') {
        const result = await tick(db);
        return json(result, result.error ? 502 : 200);
      }
      if (action === 'run-schedule') return json(await runSchedules(db));
      if (action === 'start-game') {
        const result = await rpc(db, 'boggle_start', { p_user: user.id, p_board: rollBoard() });
        if (result.error) return json(result, 409);
        // The durable round exists before the initial send. Cron recovers if this
        // request is disconnected, killed, or the board is still cooling down.
        const delivery = await tick(db);
        return json({ success: true, roundId: result.round.id, warning: delivery.error || null });
      }
      if (action === 'cancel-game') {
        if (!uuid(roundId)) return json({ error: 'Valid roundId required' }, 400);
        const result = await rpc(db, 'boggle_cancel', { p_user: user.id, p_round: roundId });
        if (result.error) return json(result, 404);
        return json(result);
      }
      if (!uuid(itemId)) return json({ error: 'Valid itemId required' }, 400);
      const { data: item, error } = await db.from('vestaboard_items').select('*')
        .eq('id', itemId).eq('user_id', user.id).single();
      if (error || !item) return json({ error: 'Item not found' }, 404);
      const claim = await rpc(db, 'boggle_claim', { p_kind: 'manual', p_user: user.id });
      if (!claim.token) return json({ error: claim.skip }, 409);
      const sendError = await deliver(db, claim, item);
      return json(sendError ? { error: sendError } : { success: true }, sendError ? 502 : 200);
    } catch (_) {
      return json({ error: 'Vestaboard operation failed. Reload to check the round; verify backend setup if this persists.' }, 500);
    }
  };
}
