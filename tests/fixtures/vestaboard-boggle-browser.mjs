import { mountBoggle } from '/assets/js/vestaboard-boggle/controller.mjs';

const check = (condition, message) => { if (!condition) throw new Error(message); };
const wait = async predicate => {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error('Browser condition timed out');
};
const el = id => document.getElementById(`boggle-${id}`);
let stored = null, failRead = false, confirmed = true, commandCount = 0, dictionaryCount = 0;
const api = {
  getUser: async () => ({ id: 'test-owner' }),
  latest: async () => {
    if (failRead) throw new Error('Test offline');
    return structuredClone(stored);
  },
  command: async action => {
    commandCount++;
    if (action === 'start-game') stored = {
      id: `round-${commandCount}`, board: 'CATSDOGEHOUSTRIN'.split(''), status: 'launching',
      last_step: -1, started_at: null, last_error: null, cancel_requested: false,
    };
    if (action === 'cancel-game') stored.cancel_requested = true;
    return { success: true };
  },
  dictionary: async () => {
    dictionaryCount++;
    const response = await fetch('/assets/data/boggle/scowl-35.json');
    return response.json();
  },
  confirm: () => confirmed,
  signOut: async () => {},
  navigate: () => {},
};

try {
  document.getElementById('boggle-app').style.width = '360px';
  const dispose = await mountBoggle(document, api, { pollMs: 60000 });
  check(!el('start').disabled, 'Ready game enables Start');
  check(el('words-section').hidden, 'Suggestions initially hidden');
  el('start').click();
  el('start').click();
  await wait(() => !el('cancel').hidden);
  check(commandCount === 1, 'Duplicate clicks must not launch twice');
  check(el('grid').children.length === 16, 'Sixteen letter tiles');
  check(el('preview').children.length === 132, 'Full Vestaboard preview');
  check(el('start').disabled, 'Cannot replace an active game accidentally');

  // Backend changes without any browser timer or command, as when phone locks.
  stored.status = 'running';
  stored.started_at = new Date(Date.now() - 40000).toISOString();
  stored.last_step = 2;
  el('refresh').click();
  await wait(() => el('status').textContent === 'Find your words');
  check(el('progress').getAttribute('aria-label') === '14 green tiles, 4 red tiles', 'Reconnected timer step');
  check(el('words-section').hidden, 'No spoilers during play');

  confirmed = false;
  el('cancel').click();
  check(commandCount === 1, 'Dismissed cancellation does nothing');
  confirmed = true;
  el('cancel').click();
  await wait(() => el('detail').textContent.includes('Ending'));
  check(el('cancel').disabled, 'Pending cancellation cannot repeat');
  stored.status = 'cancelled';
  stored.last_step = 9;
  el('refresh').click();
  await wait(() => !el('words-section').hidden);
  check(el('progress').getAttribute('aria-label').includes('all black'), 'Final frame is black');
  const before = commandCount;
  el('reveal').click();
  await wait(() => el('words').querySelectorAll('button').length > 0);
  const house = [...el('words').querySelectorAll('button')].find(button => button.textContent === 'HOUSE');
  check(house, 'Common-word suggestion is present');
  house.click();
  check(el('grid').querySelectorAll('[data-path]').length === 5, 'Path highlights five tiles');
  check(el('path').textContent.startsWith('HOUSE:'), 'Accessible path description');
  check(commandCount === before && dictionaryCount === 1, 'Suggestions never call the board');

  failRead = true;
  el('refresh').click();
  await wait(() => el('message').textContent === 'Test offline');
  check(el('start').disabled, 'Offline status prevents duplicate launch');
  failRead = false;
  el('refresh').click();
  await wait(() => !el('start').disabled);
  check(el('message').hidden, 'Connection warning clears after recovery');
  check(document.documentElement.scrollWidth <= window.innerWidth, 'No horizontal overflow');
  check(document.getElementById('boggle-app').scrollWidth <= document.getElementById('boggle-app').clientWidth, '360px phone layout does not overflow');
  dispose();

  // A fresh document with the same persisted round recovers without a new game.
  const recoveredDoc = new DOMParser().parseFromString(document.documentElement.outerHTML, 'text/html');
  const stopRecovery = await mountBoggle(recoveredDoc, api, { pollMs: 60000 });
  check(recoveredDoc.getElementById('boggle-status').textContent === 'Round cancelled', 'Page reopening recovers round');
  check(commandCount === 2, 'Recovery never invokes launch');
  stopRecovery();
  const anonymousDoc = new DOMParser().parseFromString(document.documentElement.outerHTML, 'text/html');
  let redirect = null;
  await mountBoggle(anonymousDoc, { ...api, getUser: async () => null, navigate: path => { redirect = path; } });
  check(redirect === '/personal/coaching/login/', 'Anonymous user redirected');
  document.body.dataset.status = 'passed';
  document.body.dataset.viewport = window.innerWidth;
} catch (error) {
  document.body.dataset.status = 'failed';
  const result = document.createElement('pre');
  result.textContent = error.stack;
  document.body.append(result);
}
