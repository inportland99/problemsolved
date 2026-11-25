import {
  renderBoard, buildTrie, solveBoard, hardestWords, displayCharacter,
  DURATION_MS, TIMER_TILES, TIMER_STAGES, FINAL_STEP,
} from './game.mjs';

const color = { 64: '#f7941d', 66: '#39b54a', 63: '#c1272d', 70: '#000000' };
const active = round => round && ['launching', 'running'].includes(round.status);

export async function mountBoggle(doc, api, { pollMs = 5000 } = {}) {
  const el = id => doc.getElementById(`boggle-${id}`);
  let user, round = null, busy = false, refreshing = false, connected = false;
  let trie = null, revealedId = null, disposed = false, interval;
  let dictionaryPromise = null, finishRoundId = null, finishWords = null;
  const message = text => {
    el('message').textContent = text || '';
    el('message').hidden = !text;
  };

  async function getTrie() {
    if (trie) return trie;
    dictionaryPromise ??= api.dictionary().then(data => {
      trie = buildTrie(data.words);
      return trie;
    }).catch(error => {
      dictionaryPromise = null;
      throw error;
    });
    return dictionaryPromise;
  }

  function physicalGrid() {
    if (!round) return Array.from({ length: 6 }, () => Array(22).fill(0));
    return renderBoard(round.board, Math.max(0, round.last_step ?? 0), {
      finishWords: round.status === 'finished' && finishRoundId === round.id ? finishWords : null,
    });
  }

  function renderPreview(grid = physicalGrid()) {
    el('preview').replaceChildren();
    grid.flat().forEach(code => {
      const cell = doc.createElement('span');
      cell.textContent = displayCharacter(code);
      if (color[code]) cell.style.backgroundColor = color[code];
      el('preview').append(cell);
    });
  }

  async function syncFinishPreview() {
    if (round?.status !== 'finished' || round.last_step !== FINAL_STEP || finishRoundId === round.id) return;
    const selectedRound = round;
    try {
      const dictionary = await getTrie();
      if (disposed || round?.id !== selectedRound.id || round.status !== 'finished') return;
      finishWords = hardestWords(solveBoard(selectedRound.board, dictionary).map(result => result.word));
      finishRoundId = selectedRound.id;
      renderPreview();
    } catch (_) {
      // A local preview failure must never stop the physical timer or controls.
      message('The round finished, but its word preview could not load. Refresh to try again.');
    }
  }

  function controls() {
    el('start').disabled = !connected || busy || refreshing || !!active(round);
    el('cancel').hidden = !active(round);
    el('cancel').disabled = busy || refreshing || !connected || !!round?.cancel_requested;
    el('refresh').disabled = busy || refreshing;
  }

  function render() {
    controls();
    const statuses = {
      launching: 'Launching…', running: 'Find your words', finished: 'Time’s up',
      cancelled: 'Round cancelled', failed: 'Round interrupted',
    };
    el('status').textContent = round ? statuses[round.status] || 'Unknown round status' : 'Ready to play';
    el('detail').textContent = round?.cancel_requested && active(round)
      ? 'Ending the round. The timer will turn black when the board is ready for its next update.'
      : round?.status === 'launching' ? 'Waiting to send the letters. This can take a few seconds while the board cools down.'
      : active(round) ? 'You can lock your phone. Use the physical timer; this page shows the last accepted frame.'
      : round?.status === 'failed' ? 'Check board connectivity and backend setup before starting again. The physical display may be stale.'
      : round?.status === 'finished' ? 'The board shows “DID YOU FIND?” with up to three longest words. Compare your lists, then explore all suggestions below.'
      : round ? 'The letters remain on the board. Compare your paper lists, then reveal suggestions.'
      : 'Have paper and pencils ready. The grid is different every round.';
    el('grid').replaceChildren();
    el('progress').replaceChildren();
    const board = round?.board || Array(16).fill(' ');
    board.forEach((letter, i) => {
      const cell = doc.createElement('div');
      cell.className = 'boggle-letter';
      cell.textContent = letter.trim() || '·';
      cell.dataset.index = i;
      cell.setAttribute('aria-label', `Row ${Math.floor(i / 4) + 1}, column ${i % 4 + 1}: ${letter === 'Q' ? 'QU' : letter}`);
      el('grid').append(cell);
    });
    const step = Math.max(0, round?.last_step ?? 0);
    const grid = physicalGrid();
    renderPreview(grid);
    for (let i = 0; i < TIMER_TILES; i++) {
      const tile = doc.createElement('span');
      tile.style.backgroundColor = !round ? '#d4ded8' : color[grid[5][i]];
      el('progress').append(tile);
    }
    const progress = Math.min(step, TIMER_STAGES - 1);
    el('progress').setAttribute('aria-label', !round ? 'Timer not started'
      : step === FINAL_STEP ? 'Timer all black: round ended'
      : `${TIMER_TILES - progress * 2} green tiles, ${progress * 2} red tiles`);
    if (active(round) && round.started_at) {
      const seconds = Math.max(0, Math.ceil((DURATION_MS - (Date.now() - Date.parse(round.started_at))) / 1000));
      el('clock').textContent = seconds ? `About ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')} remaining`
        : 'Waiting for the final black frame…';
    } else el('clock').textContent = round?.status === 'launching' ? 'Timer begins after the first accepted send'
      : round ? 'Last accepted board frame shown above' : 'Approximately 3 minutes per round';
    el('words-section').hidden = !round || !!active(round);
    if (revealedId !== round?.id) {
      el('words').replaceChildren();
      el('path').textContent = '';
      el('word-status').textContent = '';
      el('reveal').hidden = false;
    }
  }

  async function refresh() {
    if (!user || refreshing || disposed) return;
    refreshing = true;
    controls();
    try {
      const latest = await api.latest(user.id);
      const changed = JSON.stringify(latest) !== JSON.stringify(round);
      const recovered = !connected;
      const deliveryRecovered = round?.last_error && !latest?.last_error;
      round = latest;
      connected = true;
      if (recovered || deliveryRecovered) message('');
      if (changed || recovered) { revealedId = null; render(); }
      else controls();
      if (round?.last_error) message(`Delivery issue: ${round.last_error} ${active(round) ? 'The backend will retry.' : 'Check connectivity before starting again.'}`);
      await syncFinishPreview();
    } catch (error) {
      connected = false;
      message(error.message);
      el('detail').textContent = 'Status unavailable. The backend may still be running the round. Refresh before starting another.';
    } finally {
      refreshing = false;
      controls();
    }
  }

  async function command(action) {
    if (busy || refreshing || !connected) return;
    if (action === 'cancel-game' && !api.confirm('End this round? The timer will turn black on the next available update.')) return;
    busy = true;
    message('');
    controls();
    try {
      const result = await api.command(action, round?.id);
      if (result?.warning) message(result.warning);
    } catch (error) {
      message(error.message);
    } finally {
      // Never auto-retry a start request: its response may have been lost.
      busy = false;
      await refresh();
      controls();
    }
  }

  el('start').addEventListener('click', () => command('start-game'));
  el('cancel').addEventListener('click', () => command('cancel-game'));
  el('refresh').addEventListener('click', async () => { message(''); await refresh(); });
  el('logout').addEventListener('click', async () => {
    try { await api.signOut(); api.navigate('/personal/coaching/login/'); }
    catch (_) { message('Could not log out. Try again.'); }
  });
  el('reveal').addEventListener('click', async () => {
    if (!round || active(round)) return;
    const selectedRound = round;
    el('reveal').disabled = true;
    el('word-status').textContent = 'Finding words…';
    try {
      const words = solveBoard(selectedRound.board, await getTrie());
      if (round?.id !== selectedRound.id || disposed) return;
      revealedId = round.id;
      el('words').replaceChildren();
      let length = null, group;
      for (const { word, path } of words) {
        if (word.length !== length) {
          length = word.length;
          const heading = doc.createElement('h3');
          heading.className = 'font-bold';
          heading.textContent = `${length} letters`;
          group = doc.createElement('div');
          group.className = 'boggle-word-group';
          el('words').append(heading, group);
        }
        const button = doc.createElement('button');
        button.type = 'button';
        button.textContent = word;
        button.setAttribute('aria-pressed', 'false');
        button.addEventListener('click', () => {
          el('words').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
          el('grid').querySelectorAll('[data-index]').forEach(cell => {
            const position = path.indexOf(Number(cell.dataset.index));
            if (position === -1) delete cell.dataset.path;
            else cell.dataset.path = position + 1;
          });
          el('path').textContent = `${word}: ${path.map(index => `${Math.floor(index / 4) + 1},${index % 4 + 1}`).join(' → ')}`;
        });
        group.append(button);
      }
      el('word-status').textContent = `${words.length} suggested ${words.length === 1 ? 'word' : 'words'}. Q counts as QU.`;
      el('reveal').hidden = true;
    } catch (error) {
      el('word-status').textContent = error.message;
    } finally { el('reveal').disabled = false; }
  });
  const onVisible = () => { if (!doc.hidden) refresh(); };
  doc.addEventListener('visibilitychange', onVisible);
  try {
    user = await api.getUser();
    if (!user) { api.navigate('/personal/coaching/login/'); return () => {}; }
    el('logout').hidden = false;
    connected = true;
    render();
    await refresh();
    interval = setInterval(() => { if (!doc.hidden && !busy) refresh(); }, pollMs);
  } catch (_) {
    message('Could not check your login. Reload to try again.');
  }
  return () => { disposed = true; clearInterval(interval); doc.removeEventListener('visibilitychange', onVisible); };
}
