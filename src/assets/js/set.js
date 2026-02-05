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
          <pattern id="${patternId}" patternUnits="userSpaceOnUse" width="10" height="10" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="10" stroke="${getColorHex(color)}" stroke-width="2"/>
          </pattern>
        </defs>
        <polygon points="50,10 95,30 50,50 5,30" class="${colorClass} ${shadingClass}" style="${shading === 'striped' ? `fill: url(#${patternId})` : ''}"/>
      </svg>
    `;
  } else if (shape === 'pill') {
    svg = `
      <svg viewBox="0 0 100 60" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
        <defs>
          <pattern id="${patternId}" patternUnits="userSpaceOnUse" width="10" height="10" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="10" stroke="${getColorHex(color)}" stroke-width="3"/>
          </pattern>
        </defs>
        <rect x="5" y="10" width="90" height="40" rx="20" ry="20" class="${colorClass} ${shadingClass}" style="${shading === 'striped' ? `fill: url(#${patternId})` : ''}"/>
      </svg>
    `;
  } else if (shape === 'squiggle') {
    svg = `
      <svg viewBox="0 0 100 60" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
        <defs>
          <pattern id="${patternId}" patternUnits="userSpaceOnUse" width="10" height="10" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="10" stroke="${getColorHex(color)}" stroke-width="2"/>
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
  
  // Calculate sets remaining (before adding this one)
  const setsRemaining = 6 - foundSets.length - 1;
  const message = setsRemaining === 0 
    ? 'SET Found! Puzzle complete!' 
    : `SET Found! ${setsRemaining} SET${setsRemaining === 1 ? '' : 's'} to go.`;
  showTemporaryMessage(message, 'success');
  
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
function showTemporaryMessage(message, type = 'info', duration = 2000, onDismiss = null) {
  // Remove any existing message
  const existing = document.getElementById('temp-message');
  if (existing) existing.remove();
  
  // Styles for different types
  const typeStyles = {
    'info': { bg: '#00A2FF', color: 'white' },
    'error': { bg: '#E74C3C', color: 'white' },
    'success': { bg: '#16a34a', color: 'white' },
    'error-detail': { bg: 'white', color: '#333', border: '3px solid #E74C3C' }
  };
  
  const style = typeStyles[type] || typeStyles['info'];
  
  // Create message element
  const msgDiv = document.createElement('div');
  msgDiv.id = 'temp-message';
  msgDiv.innerHTML = message;
  msgDiv.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: ${style.bg};
    color: ${style.color};
    ${style.border ? `border: ${style.border};` : ''}
    padding: 15px 25px;
    border-radius: 8px;
    font-weight: bold;
    font-size: 16px;
    z-index: 1000;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    text-align: center;
    max-width: 300px;
    ${duration ? `animation: fadeInOut ${duration}ms ease-in-out;` : 'cursor: pointer;'}
  `;
  
  document.body.appendChild(msgDiv);
  
  if (duration) {
    // Remove after animation
    setTimeout(() => {
      msgDiv.remove();
      if (onDismiss) onDismiss();
    }, duration);
  } else {
    // Click to dismiss
    msgDiv.addEventListener('click', () => {
      msgDiv.remove();
      if (onDismiss) onDismiss();
    });
  }
}

// Handle incorrect set
function handleIncorrectSet() {
  selectedCards.forEach(index => {
    const card = document.querySelector(`[data-index="${index}"]`);
    card.classList.add('incorrect-shake');
  });
  
  // Remove shake animation after it completes, but keep selected
  setTimeout(() => {
    selectedCards.forEach(index => {
      const card = document.querySelector(`[data-index="${index}"]`);
      card.classList.remove('incorrect-shake');
    });
  }, 500);
  
  // Analyze why it's not a valid set
  const [i1, i2, i3] = selectedCards;
  const card1 = currentCards[i1];
  const card2 = currentCards[i2];
  const card3 = currentCards[i3];
  
  const feedback = getSetFeedback(card1, card2, card3);
  
  // Store selected cards to clear on dismiss
  const cardsToDeselect = [...selectedCards];
  selectedCards = [];
  
  showTemporaryMessage(feedback, 'error-detail', null, () => {
    // Callback when dismissed - deselect the cards
    cardsToDeselect.forEach(index => {
      const card = document.querySelector(`[data-index="${index}"]`);
      card.classList.remove('selected');
    });
  });
}

// Render a mini card as HTML string for popups
function renderMiniCardHTML(card, uniquePrefix) {
  let shapesHTML = '';
  for (let i = 0; i < card.number; i++) {
    const uniqueId = `popup-${uniquePrefix}-${i}`;
    shapesHTML += `<div class="card-shape shape-${card.shape}" style="width: 28px; height: 18px; min-height: 18px; max-height: 18px;">${renderShape(card.shape, card.color, card.shading, uniqueId)}</div>`;
  }
  return `<div class="mini-card" style="width: 38px; height: 55px; padding: 2px; border: 1.5px solid #5741AC; border-radius: 4px; background: white; display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 1px;">
    <div class="shape-container" style="display: flex; flex-direction: column; align-items: center; gap: 1px;">${shapesHTML}</div>
  </div>`;
}

// Get feedback on why cards don't form a valid set
function getSetFeedback(card1, card2, card3) {
  const attributes = [
    { name: 'Color', values: [card1.color, card2.color, card3.color] },
    { name: 'Number', values: [card1.number, card2.number, card3.number] },
    { name: 'Shape', values: [card1.shape, card2.shape, card3.shape] },
    { name: 'Shading', values: [card1.shading, card2.shading, card3.shading] }
  ];
  
  const lines = [];
  
  for (const attr of attributes) {
    const [a, b, c] = attr.values;
    const allSame = a === b && b === c;
    const allDiff = a !== b && b !== c && a !== c;
    
    if (allSame) {
      lines.push(`<span style="color: #16a34a;">${attr.name}: all same ✓</span>`);
    } else if (allDiff) {
      lines.push(`<span style="color: #16a34a;">${attr.name}: all diff ✓</span>`);
    } else {
      lines.push(`<span style="color: #E74C3C;">${attr.name}: 2 same, 1 diff ✗</span>`);
    }
  }
  
  // Render mini cards
  const miniCardsHTML = `
    <div style="display: flex; gap: 6px; justify-content: center; margin-bottom: 12px;">
      ${renderMiniCardHTML(card1, '0')}
      ${renderMiniCardHTML(card2, '1')}
      ${renderMiniCardHTML(card3, '2')}
    </div>
  `;
  
  return `<div style="font-weight: bold; margin-bottom: 10px; color: #E74C3C;">Not a SET!</div>
    ${miniCardsHTML}
    <div style="font-size: 14px; text-align: left;">${lines.join('<br>')}</div>
    <div style="font-size: 12px; margin-top: 10px; color: #999;">Tap to dismiss</div>`;
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
    document.getElementById('helpLabel').textContent = 'Welcome to SET!';
    document.getElementById('startButton').style.display = 'inline-block';
    showModal('helpModal');
    pauseTimer();
  } else {
    startTimer();
  }
  
  // Event listeners
  document.getElementById('startButton').onclick = () => {
    hideModal('helpModal');
    document.getElementById('startButton').style.display = 'none';
    document.getElementById('helpLabel').textContent = 'How to Play';
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
    document.getElementById('helpLabel').textContent = 'How to Play';
    document.getElementById('startButton').style.display = 'none';
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
        if (modal.id === 'helpModal' || modal.id === 'pauseModal') {
          document.getElementById('startButton').style.display = 'none';
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
        if (modal.id === 'helpModal' || modal.id === 'pauseModal') {
          document.getElementById('startButton').style.display = 'none';
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
  
  // Tutorial button
  document.getElementById('tutorialBtn')?.addEventListener('click', () => {
    hideModal('helpModal');
    startTutorial();
  });
});

// ==================== TUTORIAL SYSTEM ====================

let tutorialStep = 1;
let tutorialQuizIndex = 0;
let tutorialQuizCorrect = 0;
let tutorialQuizTotal = 0;
let tutorialQuizQuestions = [];
let step3Questions = [];
let step3Index = 0;
let step3Correct = 0;

// Start the tutorial
function startTutorial() {
  tutorialStep = 1;
  tutorialQuizIndex = 0;
  tutorialQuizCorrect = 0;
  tutorialQuizTotal = 0;
  step3Correct = 0;
  
  // Reset step visibility
  document.querySelectorAll('.tutorial-step').forEach(step => step.classList.add('hidden'));
  document.getElementById('tutorial-step-1').classList.remove('hidden');
  
  // Reset dots
  document.querySelectorAll('.tutorial-step-dot').forEach(dot => dot.classList.remove('active', 'completed'));
  document.querySelector('.tutorial-step-dot[data-step="1"]').classList.add('active');
  
  // Reset navigation buttons
  document.getElementById('tutorial-prev').classList.add('hidden');
  document.getElementById('tutorial-next').classList.remove('hidden');
  document.getElementById('tutorial-finish').classList.add('hidden');
  
  // Initialize Step 1 examples
  initTutorialStep1();
  
  showModal('tutorialModal');
}

// Initialize Step 1: Show attribute examples
function initTutorialStep1() {
  // Color examples (same shape, number, shading - different colors)
  const colorsContainer = document.getElementById('step1-colors');
  colorsContainer.innerHTML = '';
  ['red', 'green', 'purple'].forEach((color, idx) => {
    const card = { number: 1, shape: 'diamond', shading: 'solid', color };
    colorsContainer.appendChild(renderTutorialCard(card, `step1-color-${idx}`, false, null, true));
  });
  
  // Shape examples (same color, number, shading - different shapes)
  const shapesContainer = document.getElementById('step1-shapes');
  shapesContainer.innerHTML = '';
  ['squiggle', 'diamond', 'pill'].forEach((shape, idx) => {
    const card = { number: 1, shape, shading: 'solid', color: 'red' };
    shapesContainer.appendChild(renderTutorialCard(card, `step1-shape-${idx}`, false, null, true));
  });
  
  // Number examples (same color, shape, shading - different numbers)
  const numbersContainer = document.getElementById('step1-numbers');
  numbersContainer.innerHTML = '';
  [1, 2, 3].forEach((number, idx) => {
    const card = { number, shape: 'pill', shading: 'solid', color: 'green' };
    numbersContainer.appendChild(renderTutorialCard(card, `step1-number-${idx}`, false, null, true));
  });
  
  // Shading examples (same color, shape, number - different shadings)
  const shadingsContainer = document.getElementById('step1-shadings');
  shadingsContainer.innerHTML = '';
  ['solid', 'striped', 'empty'].forEach((shading, idx) => {
    const card = { number: 1, shape: 'squiggle', shading, color: 'purple' };
    shadingsContainer.appendChild(renderTutorialCard(card, `step1-shading-${idx}`, false, null, true));
  });
}

// Navigate to a specific step
function goToTutorialStep(step) {
  tutorialStep = step;
  
  // Update step visibility
  document.querySelectorAll('.tutorial-step').forEach(s => s.classList.add('hidden'));
  document.getElementById(`tutorial-step-${step}`).classList.remove('hidden');
  
  // Update dots
  document.querySelectorAll('.tutorial-step-dot').forEach(dot => {
    const dotStep = parseInt(dot.dataset.step);
    dot.classList.remove('active');
    if (dotStep < step) {
      dot.classList.add('completed');
    } else if (dotStep === step) {
      dot.classList.add('active');
    } else {
      dot.classList.remove('completed');
    }
  });
  
  // Update navigation buttons
  document.getElementById('tutorial-prev').classList.toggle('hidden', step === 1);
  
  if (step === 4) {
    document.getElementById('tutorial-next').classList.add('hidden');
    document.getElementById('tutorial-finish').classList.remove('hidden');
  } else {
    document.getElementById('tutorial-next').classList.remove('hidden');
    document.getElementById('tutorial-finish').classList.add('hidden');
  }
  
  // Initialize step content
  if (step === 2) {
    initTutorialStep2();
  } else if (step === 3) {
    initTutorialStep3();
  } else if (step === 4) {
    initTutorialStep4();
  }
}

// Render a tutorial card (larger than mini, smaller than game)
function renderTutorialCard(card, uniquePrefix, isClickable = false, onClick = null, isSmall = false) {
  const cardDiv = document.createElement('div');
  cardDiv.className = 'tutorial-card' + (isClickable ? ' tutorial-card-clickable' : '') + (isSmall ? ' tutorial-card-sm' : '');
  
  const container = document.createElement('div');
  container.className = 'shape-container';
  
  for (let i = 0; i < card.number; i++) {
    const shapeDiv = document.createElement('div');
    shapeDiv.className = `card-shape shape-${card.shape}`;
    const uniqueId = `tutorial-${uniquePrefix}-${i}`;
    shapeDiv.innerHTML = renderShape(card.shape, card.color, card.shading, uniqueId);
    container.appendChild(shapeDiv);
  }
  
  cardDiv.appendChild(container);
  
  if (isClickable && onClick) {
    cardDiv.addEventListener('click', onClick);
  }
  
  return cardDiv;
}

// Get the third card that completes a SET given two cards
function getCompletingCard(card1, card2) {
  const getThirdValue = (v1, v2, options) => {
    if (v1 === v2) return v1;
    return options.find(v => v !== v1 && v !== v2);
  };
  
  return {
    number: getThirdValue(card1.number, card2.number, NUMBERS),
    shape: getThirdValue(card1.shape, card2.shape, SHAPES),
    shading: getThirdValue(card1.shading, card2.shading, SHADINGS),
    color: getThirdValue(card1.color, card2.color, COLORS)
  };
}

// Generate explanation for a set of 3 cards
function generateSetExplanation(card1, card2, card3, isValid) {
  const attributes = [
    { name: 'Color', values: [card1.color, card2.color, card3.color] },
    { name: 'Number', values: [card1.number, card2.number, card3.number] },
    { name: 'Shape', values: [card1.shape, card2.shape, card3.shape] },
    { name: 'Shading', values: [card1.shading, card2.shading, card3.shading] }
  ];
  
  const lines = [];
  
  for (const attr of attributes) {
    const [a, b, c] = attr.values;
    const allSame = a === b && b === c;
    const allDiff = a !== b && b !== c && a !== c;
    
    if (allSame) {
      lines.push(`<strong>${attr.name}:</strong> <span class="text-green-600">all same ✓</span>`);
    } else if (allDiff) {
      lines.push(`<strong>${attr.name}:</strong> <span class="text-green-600">all different ✓</span>`);
    } else {
      lines.push(`<strong>${attr.name}:</strong> <span class="text-red-600">2 same, 1 different ✗</span>`);
    }
  }
  
  return lines.join('<br>');
}

// Initialize Step 2: Examples
function initTutorialStep2() {
  // Generate a valid SET example
  const allCards = generateAllCards();
  const shuffled = shuffleArray(allCards, Math.random);
  
  // Find a valid set from shuffled cards
  let validSet = null;
  for (let i = 0; i < shuffled.length && !validSet; i++) {
    for (let j = i + 1; j < shuffled.length && !validSet; j++) {
      for (let k = j + 1; k < shuffled.length && !validSet; k++) {
        if (isValidSet(shuffled[i], shuffled[j], shuffled[k])) {
          validSet = [shuffled[i], shuffled[j], shuffled[k]];
        }
      }
    }
  }
  
  // Render valid SET
  const validContainer = document.getElementById('tutorial-valid-set');
  validContainer.innerHTML = '';
  validSet.forEach((card, idx) => {
    validContainer.appendChild(renderTutorialCard(card, `valid-${idx}`, false, null, true));
  });
  document.getElementById('tutorial-valid-explanation').innerHTML = 
    generateSetExplanation(validSet[0], validSet[1], validSet[2], true);
  
  // Generate an invalid SET example (2 same, 1 different for some attribute)
  // Take two cards from the valid set and find a third that breaks it
  let invalidSet = null;
  const card1 = validSet[0];
  const card2 = validSet[1];
  
  // Find a card that makes it invalid
  for (const card of shuffled) {
    if (card !== card1 && card !== card2 && card !== validSet[2]) {
      if (!isValidSet(card1, card2, card)) {
        invalidSet = [card1, card2, card];
        break;
      }
    }
  }
  
  // Render invalid SET
  const invalidContainer = document.getElementById('tutorial-invalid-set');
  invalidContainer.innerHTML = '';
  invalidSet.forEach((card, idx) => {
    invalidContainer.appendChild(renderTutorialCard(card, `invalid-${idx}`, false, null, true));
  });
  document.getElementById('tutorial-invalid-explanation').innerHTML = 
    generateSetExplanation(invalidSet[0], invalidSet[1], invalidSet[2], false);
}

// Initialize Step 3: Complete the SET
function initTutorialStep3() {
  step3Index = 0;
  step3Correct = 0;
  step3Questions = [];
  
  // Generate 3 questions
  const allCards = generateAllCards();
  for (let i = 0; i < 3; i++) {
    const shuffled = shuffleArray(allCards, Math.random);
    const card1 = shuffled[0];
    const card2 = shuffled[1];
    const correctCard = getCompletingCard(card1, card2);
    
    // Get wrong options
    const wrongCards = [];
    for (const card of shuffled) {
      if (wrongCards.length >= 3) break;
      if (!cardsEqual(card, card1) && !cardsEqual(card, card2) && !cardsEqual(card, correctCard)) {
        if (!isValidSet(card1, card2, card)) {
          wrongCards.push(card);
        }
      }
    }
    
    step3Questions.push({
      card1,
      card2,
      correctCard,
      options: shuffleArray([correctCard, ...wrongCards], Math.random)
    });
  }
  
  showStep3Question();
}

// Show current Step 3 question
function showStep3Question() {
  const q = step3Questions[step3Index];
  
  document.getElementById('tutorial-step3-feedback').innerHTML = '';
  document.getElementById('tutorial-step3-score').textContent = 
    `Question ${step3Index + 1} of 3`;
  
  // Render the two given cards
  const card1Container = document.getElementById('tutorial-card-1');
  const card2Container = document.getElementById('tutorial-card-2');
  card1Container.innerHTML = '';
  card2Container.innerHTML = '';
  card1Container.appendChild(renderTutorialCard(q.card1, `given-1-${step3Index}`));
  card2Container.appendChild(renderTutorialCard(q.card2, `given-2-${step3Index}`));
  
  // Render options
  const optionsContainer = document.getElementById('tutorial-options');
  optionsContainer.innerHTML = '';
  
  let answered = false;
  
  q.options.forEach((card, idx) => {
    const isCorrect = cardsEqual(card, q.correctCard);
    const cardEl = renderTutorialCard(card, `option-${step3Index}-${idx}`, true, () => {
      if (answered) return;
      
      optionsContainer.querySelectorAll('.tutorial-card').forEach(c => {
        c.classList.remove('correct', 'incorrect');
      });
      
      if (isCorrect) {
        cardEl.classList.add('correct');
        document.getElementById('tutorial-step3-feedback').innerHTML = 
          '<span class="text-green-600 font-bold">✓ Correct!</span>';
        step3Correct++;
        answered = true;
        
        // Move to next question after delay
        setTimeout(() => {
          step3Index++;
          if (step3Index < 3) {
            showStep3Question();
          } else {
            // Show completion
            document.getElementById('tutorial-step3-feedback').innerHTML = 
              `<span class="text-green-600 font-bold">🎉 Great! You got ${step3Correct}/3 correct!</span>`;
            document.getElementById('tutorial-step3-score').textContent = '';
          }
        }, 1000);
      } else {
        cardEl.classList.add('incorrect');
        document.getElementById('tutorial-step3-feedback').innerHTML = 
          '<span class="text-red-600">✗ Try again!</span>';
      }
    });
    optionsContainer.appendChild(cardEl);
  });
}

// Check if two cards are equal
function cardsEqual(c1, c2) {
  return c1.number === c2.number && 
         c1.shape === c2.shape && 
         c1.shading === c2.shading && 
         c1.color === c2.color;
}

// Initialize Step 4: Quiz
function initTutorialStep4() {
  tutorialQuizIndex = 0;
  tutorialQuizCorrect = 0;
  tutorialQuizTotal = 5; // 5 questions
  
  // Generate quiz questions
  tutorialQuizQuestions = [];
  const allCards = generateAllCards();
  
  for (let i = 0; i < tutorialQuizTotal; i++) {
    const shuffled = shuffleArray(allCards, Math.random);
    
    if (i % 2 === 0) {
      // Generate a valid SET
      let validSet = null;
      for (let a = 0; a < shuffled.length && !validSet; a++) {
        for (let b = a + 1; b < shuffled.length && !validSet; b++) {
          for (let c = b + 1; c < shuffled.length && !validSet; c++) {
            if (isValidSet(shuffled[a], shuffled[b], shuffled[c])) {
              validSet = [shuffled[a], shuffled[b], shuffled[c]];
            }
          }
        }
      }
      tutorialQuizQuestions.push({ cards: validSet, isValid: true });
    } else {
      // Generate an invalid SET
      let invalidSet = null;
      for (let a = 0; a < shuffled.length && !invalidSet; a++) {
        for (let b = a + 1; b < shuffled.length && !invalidSet; b++) {
          for (let c = b + 1; c < shuffled.length && !invalidSet; c++) {
            if (!isValidSet(shuffled[a], shuffled[b], shuffled[c])) {
              invalidSet = [shuffled[a], shuffled[b], shuffled[c]];
            }
          }
        }
      }
      tutorialQuizQuestions.push({ cards: invalidSet, isValid: false });
    }
  }
  
  showQuizQuestion();
}

// Show current quiz question
function showQuizQuestion() {
  const question = tutorialQuizQuestions[tutorialQuizIndex];
  
  // Render cards
  const cardsContainer = document.getElementById('tutorial-quiz-cards');
  cardsContainer.innerHTML = '';
  question.cards.forEach((card, idx) => {
    cardsContainer.appendChild(renderTutorialCard(card, `quiz-${tutorialQuizIndex}-${idx}`));
  });
  
  // Reset feedback
  document.getElementById('tutorial-quiz-feedback').innerHTML = '';
  
  // Update score
  document.getElementById('tutorial-quiz-score').textContent = 
    `Question ${tutorialQuizIndex + 1} of ${tutorialQuizTotal}`;
  
  // Enable buttons
  document.getElementById('quiz-yes-btn').disabled = false;
  document.getElementById('quiz-no-btn').disabled = false;
  document.getElementById('quiz-yes-btn').classList.remove('opacity-50');
  document.getElementById('quiz-no-btn').classList.remove('opacity-50');
}

// Handle quiz answer
function handleQuizAnswer(userSaidYes) {
  const question = tutorialQuizQuestions[tutorialQuizIndex];
  const isCorrect = userSaidYes === question.isValid;
  
  if (isCorrect) {
    tutorialQuizCorrect++;
  }
  
  // Show feedback
  const feedbackEl = document.getElementById('tutorial-quiz-feedback');
  const explanation = generateSetExplanation(question.cards[0], question.cards[1], question.cards[2], question.isValid);
  
  if (isCorrect) {
    feedbackEl.innerHTML = `
      <div class="bg-green-100 border border-green-400 text-green-700 p-3 rounded mb-2">
        <strong>✓ Correct!</strong>
      </div>
      <div class="text-sm text-left">${explanation}</div>
    `;
  } else {
    feedbackEl.innerHTML = `
      <div class="bg-red-100 border border-red-400 text-red-700 p-3 rounded mb-2">
        <strong>✗ Not quite.</strong> This ${question.isValid ? 'IS' : 'is NOT'} a SET.
      </div>
      <div class="text-sm text-left">${explanation}</div>
    `;
  }
  
  // Disable buttons
  document.getElementById('quiz-yes-btn').disabled = true;
  document.getElementById('quiz-no-btn').disabled = true;
  document.getElementById('quiz-yes-btn').classList.add('opacity-50');
  document.getElementById('quiz-no-btn').classList.add('opacity-50');
  
  // Move to next question after delay
  tutorialQuizIndex++;
  
  if (tutorialQuizIndex < tutorialQuizTotal) {
    setTimeout(() => {
      showQuizQuestion();
    }, 2000);
  } else {
    // Quiz complete
    setTimeout(() => {
      document.getElementById('tutorial-quiz-feedback').innerHTML = '';
      document.getElementById('tutorial-quiz-cards').innerHTML = `
        <div class="text-center p-6">
          <div class="text-4xl mb-3">🎉</div>
          <div class="text-xl font-bold mb-2">Tutorial Complete!</div>
          <div class="text-lg">You got <strong>${tutorialQuizCorrect}</strong> out of <strong>${tutorialQuizTotal}</strong> correct!</div>
          <div class="text-sm text-gray-600 mt-2">You're ready to play the Daily SET Puzzle!</div>
        </div>
      `;
      document.getElementById('tutorial-quiz-score').textContent = '';
      document.getElementById('quiz-yes-btn').style.display = 'none';
      document.getElementById('quiz-no-btn').style.display = 'none';
    }, 2000);
  }
}

// Tutorial navigation event listeners
document.getElementById('tutorial-prev')?.addEventListener('click', () => {
  if (tutorialStep > 1) {
    goToTutorialStep(tutorialStep - 1);
  }
});

document.getElementById('tutorial-next')?.addEventListener('click', () => {
  if (tutorialStep < 4) {
    goToTutorialStep(tutorialStep + 1);
  }
});

document.getElementById('tutorial-finish')?.addEventListener('click', () => {
  hideModal('tutorialModal');
  // Reset quiz buttons visibility
  document.getElementById('quiz-yes-btn').style.display = '';
  document.getElementById('quiz-no-btn').style.display = '';
});

// Quiz answer buttons
document.getElementById('quiz-yes-btn')?.addEventListener('click', () => handleQuizAnswer(true));
document.getElementById('quiz-no-btn')?.addEventListener('click', () => handleQuizAnswer(false));

// Close tutorial modal on outside click
document.getElementById('tutorialModal')?.addEventListener('click', (e) => {
  if (e.target.id === 'tutorialModal') {
    hideModal('tutorialModal');
    // Reset quiz buttons visibility
    document.getElementById('quiz-yes-btn').style.display = '';
    document.getElementById('quiz-no-btn').style.display = '';
  }
});
