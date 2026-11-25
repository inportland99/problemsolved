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
  const gridStyle = getComputedStyle(el('grid'));
  check(gridStyle.columnGap === '0px' && gridStyle.rowGap === '0px', 'Main phone grid has no gaps');
  check(gridStyle.borderTopWidth === '12px' && gridStyle.borderTopColor === 'rgb(247, 148, 29)', 'Phone grid has an orange frame');
  const card = el('grid').closest('.boggle-card');
  const cardStyle = getComputedStyle(card);
  const contentRight = card.getBoundingClientRect().right - parseFloat(cardStyle.paddingRight) - parseFloat(cardStyle.borderRightWidth);
  check(Math.abs(el('grid').getBoundingClientRect().right - contentRight) < 1, 'Main phone grid is right-aligned, not centered');
  const firstTile = el('grid').children[0].getBoundingClientRect();
  const nextTile = el('grid').children[1].getBoundingClientRect();
  check(Math.abs(firstTile.right - nextTile.left) < 1, 'Adjacent phone tiles touch');
  check(el('preview').children.length === 132, 'Full Vestaboard preview');
  const previewRow = row => [...el('preview').children].slice(row * 22, row * 22 + 22)
    .map(cell => cell.textContent || ' ').join('');
  check(previewRow(1).slice(17, 21) === 'CATS', 'Compact grid is inside the right-hand frame');
  check(previewRow(0).slice(0, 16).trim() === 'PLAY BOGGLE', 'Centered play heading appears before finish');
  check(previewRow(2).slice(0, 16).trim() === '3+ LETTERS', 'Rule digits and punctuation are rendered');
  const orange = el('preview').children[16].style.backgroundColor;
  check(orange === 'rgb(247, 148, 29)', 'Physical frame is orange');
  check([...el('preview').children].slice(16, 22).every(cell => cell.style.backgroundColor === orange), 'Top of frame matches image');
  check(el('start').disabled, 'Cannot replace an active game accidentally');

  // Backend changes without any browser timer or command, as when phone locks.
  stored.status = 'running';
  stored.started_at = new Date(Date.now() - 45000).toISOString();
  stored.last_step = 2;
  el('refresh').click();
  await wait(() => el('status').textContent === 'Find your words');
  check(el('progress').children.length === 16, 'Sixteen progress tiles');
  check(el('progress').getAttribute('aria-label') === '12 green tiles, 4 red tiles', 'Reconnected timer step');
  const bar = [...el('progress').children].map(cell => cell.style.backgroundColor);
  check(JSON.stringify(bar) === JSON.stringify([...bar].reverse()), 'Timer shrinks from both ends');
  check(bar[0] !== bar[2] && bar[1] === bar[0] && bar[15] === bar[0], 'Both ends turn red');
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
  check([0, 1, 2, 3, 4].every(row => previewRow(row).slice(0, 16).trim() === ''), 'Cancel clears rules and does not show finish answers');
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
  stored = { ...stored, id: 'finished-round', status: 'finished', cancel_requested: false };
  el('refresh').click();
  await wait(() => previewRow(0).slice(0, 16).trim() === 'DID YOU FIND?' && !el('start').disabled);
  check(previewRow(0).slice(0, 16) === ' DID YOU FIND?  ', 'Finish title is horizontally centered');
  check([1, 2, 3].every(row => /^[A-Z]+$/.test(previewRow(row).slice(0, 16).trim())), 'Three finish words appear automatically');
  check(previewRow(1).slice(17, 21) === 'CATS', 'Finish title does not move the framed grid');
  check(dictionaryCount === 1, 'Finish preview reuses the suggestions dictionary');
  check(document.documentElement.scrollWidth <= window.innerWidth, 'No horizontal overflow');
  check(document.getElementById('boggle-app').scrollWidth <= document.getElementById('boggle-app').clientWidth, '360px phone layout does not overflow');
  dispose();

  // A fresh document with the same persisted round recovers without a new game.
  const recoveredDoc = new DOMParser().parseFromString(document.documentElement.outerHTML, 'text/html');
  const stopRecovery = await mountBoggle(recoveredDoc, api, { pollMs: 60000 });
  check(recoveredDoc.getElementById('boggle-status').textContent === 'Time’s up', 'Page reopening recovers finished round');
  check(recoveredDoc.getElementById('boggle-preview').textContent.includes('?'), 'Reopening recovers the finish reveal');
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
