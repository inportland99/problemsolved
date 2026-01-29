// Check for test mode URL parameter
const urlParams = new URLSearchParams(window.location.search);
const TEST_MODE = urlParams.has('test');

// Card attributes
const NUMBERS = [1, 2, 3];
const SHAPES = ['diamond', 'pill', 'squiggle'];
const SHADINGS = ['empty', 'striped', 'solid'];
const COLORS = ['red', 'green', 'purple'];

// Game state
let selectedCards = [];
let foundSets = [];
let currentCards = [];
let allValidSets = [];

// Timer setup
let timerInterval;
let startTime;
let elapsed = 0;
let isPaused = false;
const STATS_KEY = 'set-stats';
const GAME_STATE_KEY = 'set-game-state';

// Seeded random number generator
function mulberry32(seed) {
  return function() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}

// Get today's seed
const d = new Date();
let todaySeed = TEST_MODE ? Math.floor(Math.random() * 1000000) : 
                d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
const rand = mulberry32(todaySeed);

// Create a card object
function createCard(number, shape, shading, color) {
  return { number, shape, shading, color };
}

// Check if three cards form a valid SET
function isValidSet(card1, card2, card3) {
  const numbers = [card1.number, card2.number, card3.number];
  const shapes = [card1.shape, card2.shape, card3.shape];
  const shadings = [card1.shading, card2.shading, card3.shading];
  const colors = [card1.color, card2.color, card3.color];
  
  const allSameOrDiff = (arr) => {
    const allSame = arr[0] === arr[1] && arr[1] === arr[2];
    const allDiff = arr[0] !== arr[1] && arr[1] !== arr[2] && arr[0] !== arr[2];
    return allSame || allDiff;
  };
  
  return allSameOrDiff(numbers) && allSameOrDiff(shapes) && 
         allSameOrDiff(shadings) && allSameOrDiff(colors);
}

// Generate all possible cards (81 total)
function generateAllCards() {
  const cards = [];
  for (let number of NUMBERS) {
    for (let shape of SHAPES) {
      for (let shading of SHADINGS) {
        for (let color of COLORS) {
          cards.push(createCard(number, shape, shading, color));
        }
      }
    }
  }
  return cards;
}

// Shuffle array using seeded random
function shuffleArray(array, randomFunc) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(randomFunc() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Find all valid sets in an array of cards
function findAllSets(cards) {
  const sets = [];
  for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      for (let k = j + 1; k < cards.length; k++) {
        if (isValidSet(cards[i], cards[j], cards[k])) {
          sets.push([i, j, k]);
        }
      }
    }
  }
  return sets;
}

// Generate a daily puzzle with exactly 6 sets
function generateDailyPuzzle(seed) {
  const randomFunc = mulberry32(seed);
  const allCards = generateAllCards();
  
  // Try to find a combination with exactly 6 sets
  let attempts = 0;
  const maxAttempts = 10000;
  
  while (attempts < maxAttempts) {
    const shuffled = shuffleArray(allCards, randomFunc);
    const cards = shuffled.slice(0, 12);
    const sets = findAllSets(cards);
    
    if (sets.length === 6) {
      console.log(`Found puzzle with 6 sets after ${attempts + 1} attempts`);
      return { cards, sets };
    }
    attempts++;
  }
  
  // Fallback: return the closest we got
  console.warn('Could not find exactly 6 sets, using fallback');
  const shuffled = shuffleArray(allCards, randomFunc);
  const cards = shuffled.slice(0, 12);
  const sets = findAllSets(cards);
  return { cards, sets };
}

// Render SVG for a shape
function renderShape(shape, color, shading, uniqueId) {
  const colorClass = `color-${color}`;
  const shadingClass = `shading-${shading}`;
  const patternId = `stripe-${color}-${uniqueId}`;
  
  let svg = '';
  
  if (shape === 'diamond') {
    svg = `
      <svg viewBox="0 0 100 60" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
        <defs>
          <pattern id="${patternId}" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="${getColorHex(color)}" stroke-width="2"/>
          </pattern>
        </defs>
        <polygon points="50,10 95,30 50,50 5,30" class="${colorClass} ${shadingClass}" style="${shading === 'striped' ? `fill: url(#${patternId})` : ''}"/>
      </svg>
    `;
  } else if (shape === 'pill') {
    svg = `
      <svg viewBox="0 0 100 60" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
        <defs>
          <pattern id="${patternId}" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="${getColorHex(color)}" stroke-width="2"/>
          </pattern>
        </defs>
        <rect x="5" y="10" width="90" height="40" rx="20" ry="20" class="${colorClass} ${shadingClass}" style="${shading === 'striped' ? `fill: url(#${patternId})` : ''}"/>
      </svg>
    `;
  } else if (shape === 'squiggle') {
    svg = `
      <svg viewBox="0 0 100 60" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
        <defs>
          <pattern id="${patternId}" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="${getColorHex(color)}" stroke-width="2"/>
          </pattern>
        </defs>
        <path d="M 10 30 Q 12 10 30 12 Q 40 13 50 18 Q 60 23 70 18 Q 80 13 88 12 Q 95 14 92 30 Q 88 46 70 42 Q 60 38 50 40 Q 40 42 30 46 Q 12 48 10 30 Z" class="${colorClass} ${shadingClass}" style="${shading === 'striped' ? `fill: url(#${patternId})` : ''}"/>
      </svg>
    `;
  }
  
  return svg;
}

// Get hex color for patterns
function getColorHex(color) {
  const colors = {
    red: '#5741AC',    // Website purple
    green: '#00A2FF',  // Website blue
    purple: '#D946EF'  // Magenta
  };
  return colors[color];
}

// Render a card
function renderCard(card, index) {
  const cardDiv = document.createElement('div');
  cardDiv.className = 'set-card';
  cardDiv.dataset.index = index;
  
  const container = document.createElement('div');
  container.className = 'shape-container';
  
  for (let i = 0; i < card.number; i++) {
    const shapeDiv = document.createElement('div');
    shapeDiv.className = `card-shape shape-${card.shape}`;
    const uniqueId = `${index}-${i}`;
    shapeDiv.innerHTML = renderShape(card.shape, card.color, card.shading, uniqueId);
    container.appendChild(shapeDiv);
  }
  
  cardDiv.appendChild(container);
  cardDiv.addEventListener('click', () => handleCardClick(index));
  
  return cardDiv;
}

// Render a mini card for the found sets display
function renderMiniCard(card, setIndex, cardIndex) {
  const cardDiv = document.createElement('div');
  cardDiv.className = 'mini-card';
  
  const container = document.createElement('div');
  container.className = 'shape-container';
  
  for (let i = 0; i < card.number; i++) {
    const shapeDiv = document.createElement('div');
    shapeDiv.className = `card-shape shape-${card.shape}`;
    const uniqueId = `mini-${setIndex}-${cardIndex}-${i}`;
    shapeDiv.innerHTML = renderShape(card.shape, card.color, card.shading, uniqueId);
    container.appendChild(shapeDiv);
  }
  
  cardDiv.appendChild(container);
  return cardDiv;
}

// Handle card click
function handleCardClick(index) {
  if (isPaused) return;
  
  const cardElement = document.querySelector(`[data-index="${index}"]`);
  if (!cardElement) return;
  
  if (selectedCards.includes(index)) {
    // Deselect
    selectedCards = selectedCards.filter(i => i !== index);
    cardElement.classList.remove('selected');
  } else {
    // Select
    if (selectedCards.length < 3) {
      selectedCards.push(index);
      cardElement.classList.add('selected');
      
      // Check if we have 3 selected
      if (selectedCards.length === 3) {
        checkSelectedSet();
      }
    }
  }
}

// Check if selected cards form a valid set
function checkSelectedSet() {
  const [i1, i2, i3] = selectedCards;
  const card1 = currentCards[i1];
  const card2 = currentCards[i2];
  const card3 = currentCards[i3];
  
  console.log('Checking SET:');
  console.log('Card 1:', card1);
  console.log('Card 2:', card2);
  console.log('Card 3:', card3);
  
  const isValid = isValidSet(card1, card2, card3);
  console.log('Is valid SET?', isValid);
  
  // Check each attribute
  const numbers = [card1.number, card2.number, card3.number];
  const shapes = [card1.shape, card2.shape, card3.shape];
  const shadings = [card1.shading, card2.shading, card3.shading];
  const colors = [card1.color, card2.color, card3.color];
  
  console.log('Numbers:', numbers, 'valid?', checkAttribute(numbers));
  console.log('Shapes:', shapes, 'valid?', checkAttribute(shapes));
  console.log('Shadings:', shadings, 'valid?', checkAttribute(shadings));
  console.log('Colors:', colors, 'valid?', checkAttribute(colors));
  
  if (isValid) {
    // Check if this set has already been found
    const sortedSelected = [...selectedCards].sort((a, b) => a - b);
    const alreadyFound = foundSets.some(set => {
      const sortedSet = [...set].sort((a, b) => a - b);
      return sortedSet[0] === sortedSelected[0] && 
             sortedSet[1] === sortedSelected[1] && 
             sortedSet[2] === sortedSelected[2];
    });
    
    if (alreadyFound) {
      handleDuplicateSet();
    } else {
      handleCorrectSet();
    }
  } else {
    // Not a valid set
    handleIncorrectSet();
  }
}

function checkAttribute(arr) {
  const allSame = arr[0] === arr[1] && arr[1] === arr[2];
  const allDiff = arr[0] !== arr[1] && arr[1] !== arr[2] && arr[0] !== arr[2];
  return allSame || allDiff;
}

// Handle correct set
function handleCorrectSet() {
  // Add visual feedback
  selectedCards.forEach(index => {
    const card = document.querySelector(`[data-index="${index}"]`);
    card.classList.add('correct-flash');
  });
  
  setTimeout(() => {
    // Just clear the visual feedback - don't mark cards as found
    // since they can be part of multiple sets
    selectedCards.forEach(index => {
      const card = document.querySelector(`[data-index="${index}"]`);
      card.classList.remove('selected', 'correct-flash');
    });
    
    foundSets.push([...selectedCards]);
    selectedCards = [];
    
    // Update counter and display
    updateSetsCounter();
    updateFoundSetsDisplay();
    
    // Check if game is complete
    if (foundSets.length === 6) {
      completeGame();
    }
    
    saveGameState();
  }, 600);
}

// Handle duplicate set (already found)
function handleDuplicateSet() {
  selectedCards.forEach(index => {
    const card = document.querySelector(`[data-index="${index}"]`);
    card.classList.add('incorrect-shake');
  });
  
  // Show a temporary message
  showTemporaryMessage('Already found this SET!', 'info');
  
  setTimeout(() => {
    selectedCards.forEach(index => {
      const card = document.querySelector(`[data-index="${index}"]`);
      card.classList.remove('selected', 'incorrect-shake');
    });
    selectedCards = [];
  }, 500);
}

// Show temporary message
function showTemporaryMessage(message, type = 'info') {
  // Remove any existing message
  const existing = document.getElementById('temp-message');
  if (existing) existing.remove();
  
  // Create message element
  const msgDiv = document.createElement('div');
  msgDiv.id = 'temp-message';
  msgDiv.textContent = message;
  msgDiv.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: ${type === 'info' ? '#00A2FF' : '#E74C3C'};
    color: white;
    padding: 15px 25px;
    border-radius: 8px;
    font-weight: bold;
    font-size: 16px;
    z-index: 1000;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    animation: fadeInOut 2s ease-in-out;
  `;
  
  document.body.appendChild(msgDiv);
  
  // Remove after animation
  setTimeout(() => msgDiv.remove(), 2000);
}

// Handle incorrect set
function handleIncorrectSet() {
  selectedCards.forEach(index => {
    const card = document.querySelector(`[data-index="${index}"]`);
    card.classList.add('incorrect-shake');
  });
  
  setTimeout(() => {
    selectedCards.forEach(index => {
      const card = document.querySelector(`[data-index="${index}"]`);
      card.classList.remove('selected', 'incorrect-shake');
    });
    selectedCards = [];
  }, 500);
}

// Update sets counter
function updateSetsCounter() {
  document.getElementById('sets-count').textContent = foundSets.length;
}

// Update found sets display
function updateFoundSetsDisplay() {
  const listElement = document.getElementById('found-sets-list');
  
  if (foundSets.length === 0) {
    listElement.innerHTML = '<p class="text-sm text-gray-500 text-center w-full">No sets found yet</p>';
    return;
  }
  
  listElement.innerHTML = '';
  
  foundSets.forEach((setIndices, setIndex) => {
    const setDiv = document.createElement('div');
    setDiv.className = 'found-set-item';
    
    setIndices.forEach(cardIndex => {
      const card = currentCards[cardIndex];
      const miniCard = renderMiniCard(card, setIndex, cardIndex);
      setDiv.appendChild(miniCard);
    });
    
    listElement.appendChild(setDiv);
  });
}

// Initialize the board
function initBoard() {
  const puzzle = generateDailyPuzzle(todaySeed);
  currentCards = puzzle.cards;
  allValidSets = puzzle.sets;
  
  console.log('Daily puzzle generated:');
  console.log('Cards:', currentCards);
  console.log('Valid sets:', allValidSets);
  
  const board = document.getElementById('set-board');
  board.innerHTML = '';
  
  currentCards.forEach((card, index) => {
    board.appendChild(renderCard(card, index));
  });
  
  updateSetsCounter();
}

// Timer functions
function startTimer() {
  if (timerInterval) return;
  
  timerInterval = setInterval(() => {
    if (!isPaused) {
      elapsed++;
      updateTimerDisplay();
      saveGameState();
    }
  }, 1000);
}

function updateTimerDisplay() {
  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  document.getElementById('timer').textContent = 
    ` ${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function pauseTimer() {
  isPaused = true;
}

function resumeTimer() {
  isPaused = false;
}

function stopTimer() {
  clearInterval(timerInterval);
  timerInterval = null;
}

// Game state management
function saveGameState() {
  const state = {
    seed: todaySeed,
    foundSets,
    selectedCards,
    elapsed,
    date: d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()
  };
  localStorage.setItem(GAME_STATE_KEY, JSON.stringify(state));
}

function loadGameState() {
  const saved = localStorage.getItem(GAME_STATE_KEY);
  if (!saved) return false;
  
  const state = JSON.parse(saved);
  const today = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  
  if (state.date !== today) {
    localStorage.removeItem(GAME_STATE_KEY);
    return false;
  }
  
  foundSets = state.foundSets || [];
  elapsed = state.elapsed || 0;
  
  // Update display with found sets
  setTimeout(() => {
    updateSetsCounter();
    updateFoundSetsDisplay();
    
    if (foundSets.length === 6) {
      document.getElementById('share-btn').style.display = 'block';
    }
  }, 100);
  
  return true;
}

function resetGame() {
  if (!confirm('Are you sure you want to reset the puzzle? This will clear your progress.')) {
    return;
  }
  
  foundSets = [];
  selectedCards = [];
  elapsed = 0;
  localStorage.removeItem(GAME_STATE_KEY);
  
  document.querySelectorAll('.set-card').forEach(card => {
    card.classList.remove('found', 'selected');
  });
  
  updateSetsCounter();
  updateFoundSetsDisplay();
  updateTimerDisplay();
  saveGameState();
}

// Complete game
function completeGame() {
  stopTimer();
  updateStats(true, elapsed);
  
  // Play confetti for completing all 6 sets!
  confetti({
    particleCount: 100,
    spread: 70,
    origin: { y: 0.6 }
  });
  
  // Show share button
  document.getElementById('share-btn').style.display = 'block';
  
  // Show stats modal after a delay
  setTimeout(() => {
    updateStatsDisplay();
    showModal('statsModal');
  }, 1500);
}

// Statistics management
function updateStats(won, time) {
  const stats = getStats();
  
  stats.played++;
  if (won) {
    stats.won++;
    
    // Update streak
    const today = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
    if (stats.lastPlayedDate === today - 1 || stats.lastPlayedDate === today) {
      if (stats.lastPlayedDate !== today) {
        stats.currentStreak++;
      }
    } else {
      stats.currentStreak = 1;
    }
    stats.maxStreak = Math.max(stats.maxStreak, stats.currentStreak);
    stats.lastPlayedDate = today;
    
    // Update time stats
    stats.times.push(time);
    stats.bestTime = Math.min(stats.bestTime || Infinity, time);
  }
  
  localStorage.setItem(STATS_KEY, JSON.stringify(stats));
}

function getStats() {
  const defaultStats = {
    played: 0,
    won: 0,
    currentStreak: 0,
    maxStreak: 0,
    lastPlayedDate: 0,
    times: [],
    bestTime: null
  };
  
  const saved = localStorage.getItem(STATS_KEY);
  return saved ? { ...defaultStats, ...JSON.parse(saved) } : defaultStats;
}

function updateStatsDisplay() {
  const stats = getStats();
  
  document.getElementById('stat-played').textContent = stats.played;
  document.getElementById('stat-current-streak').textContent = stats.currentStreak;
  document.getElementById('stat-max-streak').textContent = stats.maxStreak;
  
  if (stats.bestTime) {
    const bestMins = Math.floor(stats.bestTime / 60);
    const bestSecs = stats.bestTime % 60;
    document.getElementById('stat-best-time').textContent = 
      `${bestMins}:${bestSecs.toString().padStart(2, '0')}`;
  } else {
    document.getElementById('stat-best-time').textContent = '--';
  }
  
  if (stats.times.length > 0) {
    const avgTime = Math.floor(stats.times.reduce((a, b) => a + b, 0) / stats.times.length);
    const avgMins = Math.floor(avgTime / 60);
    const avgSecs = avgTime % 60;
    document.getElementById('stat-avg-time').textContent = 
      `${avgMins}:${avgSecs.toString().padStart(2, '0')}`;
  } else {
    document.getElementById('stat-avg-time').textContent = '--';
  }
  
  // Show next puzzle countdown if game is complete
  if (foundSets.length === 6) {
    document.getElementById('game-complete-message').style.display = 'block';
    updateCountdown();
  }
}

function updateCountdown() {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  
  const diff = tomorrow - now;
  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);
  
  document.getElementById('countdown-timer').textContent = 
    `${hours}h ${minutes}m ${seconds}s`;
  
  setTimeout(updateCountdown, 1000);
}

// Share functionality
function showShareModal() {
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  const timeStr = `${mins}:${secs.toString().padStart(2, '0')}`;
  
  const shareText = `Daily SET Puzzle ${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}\n✅ All 6 sets found!\n⏱️ Time: ${timeStr}\n\nPlay at: ${window.location.origin}${window.location.pathname}`;
  
  document.getElementById('share-text').textContent = shareText;
  showModal('shareModal');
}

document.getElementById('copy-share-btn')?.addEventListener('click', () => {
  const text = document.getElementById('share-text').textContent;
  navigator.clipboard.writeText(text).then(() => {
    document.getElementById('copy-success').style.display = 'flex';
    setTimeout(() => {
      document.getElementById('copy-success').style.display = 'none';
    }, 2000);
  });
});

// Modal helper functions
function showModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }
}

function hideModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

// Initialize game
window.addEventListener('DOMContentLoaded', () => {
  const dateStr = TEST_MODE ? `🧪 Test Mode - Random Seed` : 
                  `🗓️ Daily Game: ${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  document.getElementById('daily-number').textContent = dateStr;
  
  initBoard();
  const hasState = loadGameState();
  updateTimerDisplay();
  
  if (!hasState || elapsed === 0) {
    showModal('welcomeModal');
    pauseTimer();
  } else {
    startTimer();
  }
  
  // Event listeners
  document.getElementById('startButton').onclick = () => {
    hideModal('welcomeModal');
    resumeTimer();
    startTimer();
  };
  
  document.getElementById('pauseButton').onclick = () => {
    pauseTimer();
    showModal('pauseModal');
  };
  
  document.getElementById('resumeButton').onclick = () => {
    hideModal('pauseModal');
    resumeTimer();
  };
  
  document.getElementById('clear-selection').onclick = () => {
    selectedCards.forEach(index => {
      const card = document.querySelector(`[data-index="${index}"]`);
      card?.classList.remove('selected');
    });
    selectedCards = [];
  };
  
  document.getElementById('reset-game').onclick = resetGame;
  
  document.getElementById('help-btn')?.addEventListener('click', () => {
    showModal('helpModal');
    pauseTimer();
  });
  
  document.getElementById('stats-btn')?.addEventListener('click', () => {
    updateStatsDisplay();
    showModal('statsModal');
  });
  
  document.getElementById('share-btn')?.addEventListener('click', showShareModal);
  
  document.getElementById('close-stats-btn')?.addEventListener('click', () => {
    hideModal('statsModal');
  });
  
  document.getElementById('close-share-btn')?.addEventListener('click', () => {
    hideModal('shareModal');
  });
  
  // Close modals on outside click
  document.querySelectorAll('[id$="Modal"]').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        hideModal(modal.id);
        if (modal.id === 'welcomeModal' || modal.id === 'pauseModal') {
          resumeTimer();
        }
      }
    });
  });
  
  document.querySelectorAll('[data-dismiss="modal"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const modal = btn.closest('[id$="Modal"]');
      if (modal) {
        hideModal(modal.id);
        if (modal.id === 'welcomeModal' || modal.id === 'pauseModal') {
          resumeTimer();
        }
      }
    });
  });
  
  // Close stats/share on outside click
  document.getElementById('statsModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'statsModal') hideModal('statsModal');
  });
  
  document.getElementById('shareModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'shareModal') hideModal('shareModal');
  });
});
