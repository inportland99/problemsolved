// Crack the Code Game Logic
(function() {
  'use strict';

  // Game constants
  const MAX_GUESSES = 6;
  const CODE_LENGTH = 5;
  const STORAGE_KEY = 'crack-the-code-v2-game-state';
  const STATS_KEY = 'crack-the-code-v2-stats';

  // Game state
  let solution = '';
  let currentGuess = '';
  let guesses = [];
  let gameStatus = 'playing'; // 'playing', 'won', 'lost'
  let currentRow = 0;
  let startTime = null;
  let timerInterval = null;
  let puzzleNumber = 0;

  // DOM elements
  const gameBoard = document.getElementById('game-board');
  const keyboard = document.getElementById('keyboard');
  const timerDisplay = document.getElementById('timer');
  const helpBtn = document.getElementById('help-btn');
  const statsBtn = document.getElementById('stats-btn');
  const shareBtn = document.getElementById('share-btn');
  const helpModal = document.getElementById('help-modal');
  const statsModal = document.getElementById('stats-modal');
  const shareModal = document.getElementById('share-modal');
  const dailyNumberEl = document.getElementById('daily-number');

  // Initialize game
  function init() {
    puzzleNumber = getDaysSinceEpoch();
    solution = generateDailySolution();
    dailyNumberEl.textContent = `Daily Game #${puzzleNumber}`;
    
    createBoard();
    attachEventListeners();
    
    // Try to restore saved game
    const saved = loadGameState();
    if (saved && saved.puzzleNumber === puzzleNumber) {
      restoreGameState(saved);
    } else {
      // New game - show welcome modal if not played today
      startTimer();
      setTimeout(() => helpModal.showModal(), 500);
    }
  }

  // Generate daily solution based on date
  function generateDailySolution() {
    const days = getDaysSinceEpoch();
    let seed = days;
    
    // Simple LCG random number generator
    const a = 1664525;
    const c = 1013904223;
    const m = Math.pow(2, 32);
    
    let result = '';
    for (let i = 0; i < CODE_LENGTH; i++) {
      seed = (a * seed + c) % m;
      result += Math.floor((seed / m) * 10);
    }
    
    console.log('Daily solution:', result); // For testing
    return result;
  }

  // Get days since epoch (Jan 1, 2022)
  function getDaysSinceEpoch() {
    const epoch = new Date('2022-01-01').getTime();
    const now = new Date().getTime();
    return Math.floor((now - epoch) / (1000 * 60 * 60 * 24));
  }

  // Create game board
  function createBoard() {
    gameBoard.innerHTML = '';
    for (let i = 0; i < MAX_GUESSES; i++) {
      const row = document.createElement('div');
      row.className = 'guess-row';
      row.dataset.row = i;
      
      for (let j = 0; j < CODE_LENGTH; j++) {
        const tile = document.createElement('div');
        tile.className = 'tile tile-empty';
        tile.dataset.index = j;
        row.appendChild(tile);
      }
      
      gameBoard.appendChild(row);
    }
  }

  // Attach event listeners
  function attachEventListeners() {
    // Keyboard clicks
    keyboard.addEventListener('click', (e) => {
      if (gameStatus !== 'playing') return;
      
      const btn = e.target.closest('.key-btn');
      if (!btn) return;
      
      const key = btn.dataset.key;
      handleKeyPress(key);
    });

    // Physical keyboard
    document.addEventListener('keydown', (e) => {
      if (gameStatus !== 'playing') return;
      
      if (e.key >= '0' && e.key <= '9') {
        handleKeyPress(e.key);
      } else if (e.key === 'Enter') {
        handleKeyPress('Enter');
      } else if (e.key === 'Backspace') {
        handleKeyPress('Backspace');
      }
    });

    // Button clicks
    helpBtn.addEventListener('click', () => helpModal.showModal());
    statsBtn.addEventListener('click', () => {
      updateStatsDisplay();
      statsModal.showModal();
    });
    shareBtn.addEventListener('click', () => {
      showShareModal();
    });

    // Copy share text
    document.getElementById('copy-share-btn').addEventListener('click', () => {
      const shareText = document.getElementById('share-text').textContent;
      navigator.clipboard.writeText(shareText).then(() => {
        const successMsg = document.getElementById('copy-success');
        successMsg.style.display = 'flex';
        setTimeout(() => {
          successMsg.style.display = 'none';
        }, 2000);
      });
    });
  }

  // Handle key press
  function handleKeyPress(key) {
    if (key === 'Backspace') {
      if (currentGuess.length > 0) {
        currentGuess = currentGuess.slice(0, -1);
        updateCurrentRow();
      }
    } else if (key === 'Enter') {
      if (currentGuess.length === CODE_LENGTH) {
        submitGuess();
      } else {
        shakeRow(currentRow);
      }
    } else if (key >= '0' && key <= '9') {
      if (currentGuess.length < CODE_LENGTH) {
        currentGuess += key;
        updateCurrentRow();
      }
    }
  }

  // Update current row display
  function updateCurrentRow() {
    const row = document.querySelector(`[data-row="${currentRow}"]`);
    const tiles = row.querySelectorAll('.tile');
    
    tiles.forEach((tile, i) => {
      if (i < currentGuess.length) {
        tile.textContent = currentGuess[i];
        tile.className = 'tile filled';
      } else {
        tile.textContent = '';
        tile.className = 'tile tile-empty';
      }
    });
  }

  // Submit guess
  function submitGuess() {
    guesses.push(currentGuess);
    
    const evaluation = evaluateGuess(currentGuess, solution);
    const row = document.querySelector(`[data-row="${currentRow}"]`);
    const tiles = row.querySelectorAll('.tile');
    
    // Animate tiles
    tiles.forEach((tile, i) => {
      setTimeout(() => {
        tile.classList.add('flip');
        setTimeout(() => {
          tile.className = `tile tile-${evaluation[i]}`;
          updateKeyboard(currentGuess[i], evaluation[i]);
        }, 250);
      }, i * 100);
    });

    // Check win/loss after animation
    setTimeout(() => {
      if (evaluation.every(e => e === 'correct')) {
        gameWon();
      } else if (currentRow === MAX_GUESSES - 1) {
        gameLost();
      } else {
        currentRow++;
        currentGuess = '';
        saveGameState();
      }
    }, CODE_LENGTH * 100 + 500);
  }

  // Evaluate guess
  function evaluateGuess(guess, solution) {
    const result = Array(CODE_LENGTH).fill('absent');
    const solutionChars = solution.split('');
    const guessChars = guess.split('');
    
    // First pass: mark correct positions
    for (let i = 0; i < CODE_LENGTH; i++) {
      if (guessChars[i] === solutionChars[i]) {
        result[i] = 'correct';
        solutionChars[i] = null;
        guessChars[i] = null;
      }
    }
    
    // Second pass: mark present digits
    for (let i = 0; i < CODE_LENGTH; i++) {
      if (guessChars[i] !== null) {
        const index = solutionChars.indexOf(guessChars[i]);
        if (index !== -1) {
          result[i] = 'present';
          solutionChars[index] = null;
        }
      }
    }
    
    return result;
  }

  // Update keyboard colors
  function updateKeyboard(digit, state) {
    const key = keyboard.querySelector(`[data-key="${digit}"]`);
    if (!key) return;
    
    const currentState = key.dataset.state || 'unknown';
    const priority = { 'unknown': 0, 'absent': 1, 'present': 2, 'correct': 3 };
    
    if (priority[state] > priority[currentState]) {
      key.dataset.state = state;
    }
  }

  // Shake row animation
  function shakeRow(rowIndex) {
    const row = document.querySelector(`[data-row="${rowIndex}"]`);
    row.classList.add('shake');
    setTimeout(() => {
      row.classList.remove('shake');
    }, 500);
  }

  // Game won
  function gameWon() {
    gameStatus = 'won';
    stopTimer();
    saveGameState();
    updateStats(true);
    shareBtn.style.display = 'inline-flex';
    
    // Confetti!
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 }
    });
    
    setTimeout(() => {
      updateStatsDisplay();
      statsModal.showModal();
    }, 1500);
  }

  // Game lost
  function gameLost() {
    gameStatus = 'lost';
    stopTimer();
    saveGameState();
    updateStats(false);
    shareBtn.style.display = 'inline-flex';
    
    setTimeout(() => {
      updateStatsDisplay();
      statsModal.showModal();
    }, 1500);
  }

  // Timer functions
  function startTimer() {
    startTime = Date.now();
    timerInterval = setInterval(updateTimer, 1000);
  }

  function stopTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  function updateTimer() {
    if (!startTime) return;
    
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    timerDisplay.textContent = ` ${minutes}:${String(seconds).padStart(2, '0')}`;
  }

  // Save game state
  function saveGameState() {
    const state = {
      puzzleNumber,
      solution,
      guesses,
      currentRow,
      gameStatus,
      startTime,
      currentGuess
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  // Load game state
  function loadGameState() {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : null;
  }

  // Restore game state
  function restoreGameState(state) {
    solution = state.solution;
    guesses = state.guesses;
    currentRow = state.currentRow;
    gameStatus = state.gameStatus;
    startTime = state.startTime;
    currentGuess = state.currentGuess || '';
    
    // Restore board
    guesses.forEach((guess, rowIndex) => {
      const evaluation = evaluateGuess(guess, solution);
      const row = document.querySelector(`[data-row="${rowIndex}"]`);
      const tiles = row.querySelectorAll('.tile');
      
      tiles.forEach((tile, i) => {
        tile.textContent = guess[i];
        tile.className = `tile tile-${evaluation[i]}`;
        updateKeyboard(guess[i], evaluation[i]);
      });
    });
    
    // Restore current guess if game is still playing
    if (gameStatus === 'playing') {
      updateCurrentRow();
      startTimer();
    } else {
      shareBtn.style.display = 'inline-flex';
    }
    
    updateTimer();
  }

  // Stats functions
  function getStats() {
    const saved = localStorage.getItem(STATS_KEY);
    return saved ? JSON.parse(saved) : {
      gamesPlayed: 0,
      gamesWon: 0,
      currentStreak: 0,
      maxStreak: 0,
      guessDistribution: [0, 0, 0, 0, 0, 0]
    };
  }

  function saveStats(stats) {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  }

  function updateStats(won) {
    const stats = getStats();
    stats.gamesPlayed++;
    
    if (won) {
      stats.gamesWon++;
      stats.currentStreak++;
      stats.maxStreak = Math.max(stats.maxStreak, stats.currentStreak);
      stats.guessDistribution[guesses.length - 1]++;
    } else {
      stats.currentStreak = 0;
    }
    
    saveStats(stats);
  }

  function updateStatsDisplay() {
    const stats = getStats();
    const winRate = stats.gamesPlayed > 0 
      ? Math.round((stats.gamesWon / stats.gamesPlayed) * 100) 
      : 0;
    
    document.getElementById('stat-played').textContent = stats.gamesPlayed;
    document.getElementById('stat-win-rate').textContent = winRate;
    document.getElementById('stat-current-streak').textContent = stats.currentStreak;
    document.getElementById('stat-max-streak').textContent = stats.maxStreak;
    
    // Guess distribution
    const distContainer = document.getElementById('guess-distribution');
    distContainer.innerHTML = '';
    
    const maxGuesses = Math.max(...stats.guessDistribution, 1);
    
    stats.guessDistribution.forEach((count, index) => {
      const barDiv = document.createElement('div');
      barDiv.className = 'stat-bar';
      
      const label = document.createElement('div');
      label.className = 'stat-bar-label';
      label.textContent = index + 1;
      
      const barContainer = document.createElement('div');
      barContainer.className = 'stat-bar-container';
      
      const barFill = document.createElement('div');
      barFill.className = 'stat-bar-fill';
      const width = maxGuesses > 0 ? (count / maxGuesses) * 100 : 0;
      barFill.style.width = Math.max(width, count > 0 ? 10 : 0) + '%';
      barFill.textContent = count;
      
      // Highlight current game if won
      if (gameStatus === 'won' && guesses.length === index + 1) {
        barFill.classList.add('highlight');
      }
      
      barContainer.appendChild(barFill);
      barDiv.appendChild(label);
      barDiv.appendChild(barContainer);
      distContainer.appendChild(barDiv);
    });
    
    // Show countdown if game is complete
    if (gameStatus !== 'playing') {
      document.getElementById('game-complete-message').style.display = 'block';
      updateCountdown();
      setInterval(updateCountdown, 1000);
    }
  }

  // Countdown to next puzzle
  function updateCountdown() {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    
    const diff = tomorrow - now;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    
    document.getElementById('countdown-timer').textContent = 
      `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  // Share modal
  function showShareModal() {
    const shareText = generateShareText();
    document.getElementById('share-text').textContent = shareText;
    document.getElementById('copy-success').style.display = 'none';
    shareModal.showModal();
  }

  function generateShareText() {
    const status = gameStatus === 'won' 
      ? `${guesses.length}/${MAX_GUESSES}` 
      : `X/${MAX_GUESSES}`;
    
    let text = `Crack the Code #${puzzleNumber} ${status}\n\n`;
    
    guesses.forEach(guess => {
      const evaluation = evaluateGuess(guess, solution);
      evaluation.forEach(state => {
        if (state === 'correct') {
          text += '🟩';
        } else if (state === 'present') {
          text += '🟨';
        } else {
          text += '⬜';
        }
      });
      text += '\n';
    });
    
    text += `\n${window.location.origin}/games/crack-the-code-v2`;
    
    return text;
  }

  // Start the game
  init();
})();
