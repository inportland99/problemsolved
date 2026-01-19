const TEST_MODE = true; // Set to false for production

const gridSize = 4;
let currentBoard = [];
let undoStack = [];
let redoStack = [];
let solved = false;
let mysteryPosition = null; // { type: 'shape'|'sum', row: number, col: number }
let solution = null;
let shapeTypes = [];
let shapeValues = {};

// Timer setup
let timerInterval;
let startTime;
let elapsed = 0;
let isPaused = false;

const d = new Date();
let todaySeed = TEST_MODE ? Math.floor(Math.random() * 1000000) : d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
const rand = mulberry32(todaySeed);

// Available shape types
const allShapes = ['triangle', 'square', 'pentagon', 'circle', 'star', 'hexagon', 'diamond'];

// Seeded random number generator
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// Shuffle array using seeded RNG
function shuffleArray(arr, rng) {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// Generate a valid puzzle with unique solution
function generatePuzzle() {
  // Pick 4 random shapes for this puzzle
  shapeTypes = shuffleArray(allShapes, rand).slice(0, 4);
  
  // Assign random values (1-9) to each shape
  const availableValues = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const selectedValues = shuffleArray(availableValues, rand).slice(0, 4);
  shapeTypes.forEach((shape, idx) => {
    shapeValues[shape] = selectedValues[idx];
  });
  
  // Generate a 4x4 grid with random shapes
  const grid = [];
  for (let r = 0; r < gridSize; r++) {
    grid[r] = [];
    for (let c = 0; c < gridSize; c++) {
      const shapeIdx = Math.floor(rand() * shapeTypes.length);
      grid[r][c] = shapeTypes[shapeIdx];
    }
  }
  
  // Calculate row and column sums
  const rowSums = [];
  const colSums = [];
  
  for (let r = 0; r < gridSize; r++) {
    rowSums[r] = 0;
    for (let c = 0; c < gridSize; c++) {
      rowSums[r] += shapeValues[grid[r][c]];
    }
  }
  
  for (let c = 0; c < gridSize; c++) {
    colSums[c] = 0;
    for (let r = 0; r < gridSize; r++) {
      colSums[c] += shapeValues[grid[r][c]];
    }
  }
  
  // Decide what to hide - either a shape or a sum
  const hideShape = rand() < 0.5;
  
  if (hideShape) {
    // Hide a random shape
    const row = Math.floor(rand() * gridSize);
    const col = Math.floor(rand() * gridSize);
    mysteryPosition = { type: 'shape', row, col, answer: grid[row][col] };
    grid[row][col] = '?';
  } else {
    // Hide a random sum (either row or column)
    const hideRow = rand() < 0.5;
    if (hideRow) {
      const row = Math.floor(rand() * gridSize);
      mysteryPosition = { type: 'rowSum', row, answer: rowSums[row] };
      rowSums[row] = '?';
    } else {
      const col = Math.floor(rand() * gridSize);
      mysteryPosition = { type: 'colSum', col, answer: colSums[col] };
      colSums[col] = '?';
    }
  }
  
  return { grid, rowSums, colSums };
}

// Create the visual shape element
function createShape(shapeType) {
  const div = document.createElement('div');
  div.className = `shape shape-${shapeType}`;
  return div;
}

// Render the grid
function renderGrid() {
  const container = document.getElementById('shape-sum-grid');
  container.innerHTML = '';
  
  // Create 5x5 grid (4x4 puzzle + 1 row/col for sums)
  for (let r = 0; r < gridSize + 1; r++) {
    for (let c = 0; c < gridSize + 1; c++) {
      const cell = document.createElement('div');
      
      // Bottom-right corner is empty
      if (r === gridSize && c === gridSize) {
        cell.className = 'sum-cell';
        container.appendChild(cell);
        continue;
      }
      
      // Last column shows row sums
      if (c === gridSize) {
        cell.className = 'sum-cell';
        if (solution.rowSums[r] === '?') {
          const input = document.createElement('input');
          input.type = 'text';
          input.inputMode = 'numeric';
          input.maxLength = 2;
          input.dataset.row = r;
          input.dataset.type = 'rowSum';
          input.value = currentBoard.mysteryValue || '';
          input.addEventListener('input', handleSumInput);
          cell.appendChild(input);
          cell.classList.add('mystery-sum');
        } else {
          cell.textContent = solution.rowSums[r];
        }
        container.appendChild(cell);
        continue;
      }
      
      // Last row shows column sums
      if (r === gridSize) {
        cell.className = 'sum-cell';
        if (solution.colSums[c] === '?') {
          const input = document.createElement('input');
          input.type = 'text';
          input.inputMode = 'numeric';
          input.maxLength = 2;
          input.dataset.col = c;
          input.dataset.type = 'colSum';
          input.value = currentBoard.mysteryValue || '';
          input.addEventListener('input', handleSumInput);
          cell.appendChild(input);
          cell.classList.add('mystery-sum');
        } else {
          cell.textContent = solution.colSums[c];
        }
        container.appendChild(cell);
        continue;
      }
      
      // Regular grid cells
      cell.className = 'grid-cell';
      cell.dataset.row = r;
      cell.dataset.col = c;
      
      if (solution.grid[r][c] === '?') {
        // Mystery shape cell
        cell.classList.add('mystery-cell');
        const currentShape = currentBoard.grid[r][c];
        if (currentShape && currentShape !== '?') {
          cell.appendChild(createShape(currentShape));
        }
        cell.addEventListener('click', () => handleShapeClick(r, c));
      } else {
        // Known shape cell
        cell.appendChild(createShape(solution.grid[r][c]));
      }
      
      container.appendChild(cell);
    }
  }
  
  // Restore disabled state if solved
  if (solved) {
    disableInputs();
  }
}

// Handle clicking on a mystery shape cell
function handleShapeClick(row, col) {
  if (solved) return;
  
  // Save state for undo
  undoStack.push(cloneBoardState(currentBoard));
  redoStack = [];
  
  // Cycle through available shapes
  const currentShape = currentBoard.grid[row][col];
  let currentIdx = shapeTypes.indexOf(currentShape);
  currentIdx = (currentIdx + 1) % shapeTypes.length;
  currentBoard.grid[row][col] = shapeTypes[currentIdx];
  
  renderGrid();
  saveGameState();
}

// Handle sum input
function handleSumInput(e) {
  const input = e.target;
  const value = input.value.replace(/\D/g, ''); // Only allow digits
  input.value = value;
  
  // Save state for undo
  if (value !== currentBoard.mysteryValue) {
    undoStack.push(cloneBoardState(currentBoard));
    redoStack = [];
    currentBoard.mysteryValue = value;
    saveGameState();
  }
}

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

// Timer functions
function startTimer() {
  if (solved) return;
  startTime = Date.now() - elapsed * 1000;
  timerInterval = setInterval(updateTimer, 1000);
  isPaused = false;
}

function updateTimer() {
  if (!isPaused) {
    elapsed = Math.floor((Date.now() - startTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    document.getElementById('timer').innerText = ` ${minutes}:${seconds.toString().padStart(2, '0')}`;
    updateElapsedTimeInStorage();
  }
}

function pauseTimer() {
  isPaused = true;
  clearInterval(timerInterval);
}

function resumeTimer() {
  if (solved) return;
  startTime = Date.now() - elapsed * 1000;
  timerInterval = setInterval(updateTimer, 1000);
  isPaused = false;
}

function updateElapsedTimeInStorage() {
  const saved = localStorage.getItem("shapeSumGameState");
  if (!saved) return;
  try {
    const data = JSON.parse(saved);
    data.elapsed = elapsed;
    localStorage.setItem("shapeSumGameState", JSON.stringify(data));
  } catch (e) {
    console.error("Could not update elapsed time:", e);
  }
}

// Check puzzle solution
function checkPuzzle() {
  // Check if mystery shape is correct
  if (mysteryPosition.type === 'shape') {
    const userShape = currentBoard.grid[mysteryPosition.row][mysteryPosition.col];
    if (userShape !== mysteryPosition.answer) {
      return { status: false, reason: "Shape doesn't match the sums" };
    }
  }
  
  // Check if mystery sum is correct
  if (mysteryPosition.type === 'rowSum' || mysteryPosition.type === 'colSum') {
    const userSum = parseInt(currentBoard.mysteryValue) || 0;
    if (userSum !== mysteryPosition.answer) {
      return { status: false, reason: "Sum is incorrect" };
    }
  }
  
  return { status: true };
}

function showCheckModal() {
  const result = checkPuzzle();
  const modal = document.getElementById('checkPuzzleModal');
  const modalBody = modal.querySelector('.modal-body');
  
  if (result.status) {
    solved = true;
    saveGameState();
    confetti();
    clearInterval(timerInterval);
    
    modalBody.innerHTML = `🎉 Problem Solved! 🎉 <br />You solved today's puzzle in ${document.getElementById('timer').innerText.trim()}!`;
    modalBody.innerHTML += `
      <br><button id="share-shape-sum-button" class="btn btn-success mt-3">
        <i class="bi bi-share"></i> Share
      </button>
      <br><br>Next puzzle will be available at midnight! <br>
    `;
    
    setTimeout(() => {
      const shareBtn = document.getElementById('share-shape-sum-button');
      if (shareBtn) {
        shareBtn.addEventListener('click', () => {
          const shareText = `MPA's Daily Shape Sum Challenge\nI solved it in ${document.getElementById('timer').innerText.trim()}! https://games.mathplusacademy.com/shape-sum/`;
          navigator.clipboard.writeText(shareText).then(() => {
            shareBtn.innerText = "Copied!";
            setTimeout(() => shareBtn.innerHTML = `Share <i class="fa-solid fa-share-nodes"></i>`, 1500);
          });
        });
      }
      disableInputs();
    }, 0);
  } else {
    modalBody.innerHTML = result.reason || 'Not quite. Keep trying!';
  }
  
  showModal(modal.id);
  
  const closeBtn = modal.querySelector('[data-dismiss="modal"]');
  if (closeBtn) {
    closeBtn.onclick = () => hideModal(modal.id);
  }
}

// Clone board state for undo
function cloneBoardState(board) {
  return {
    grid: board.grid.map(row => [...row]),
    mysteryValue: board.mysteryValue,
    shapeGuesses: { ...(board.shapeGuesses || {}) }
  };
}

// Save game state
function saveGameState() {
  const data = {
    board: currentBoard,
    elapsed: elapsed,
    solved: solved,
    date: d.toISOString().slice(0, 10),
    seed: todaySeed
  };
  localStorage.setItem("shapeSumGameState", JSON.stringify(data));
}

// Load game state
function loadGameState() {
  const saved = localStorage.getItem("shapeSumGameState");
  if (!saved) return false;
  
  try {
    const data = JSON.parse(saved);
    const today = new Date().toISOString().slice(0, 10);
    
    if (data.date === today && data.seed === todaySeed) {
      currentBoard = data.board;
      solved = data.solved;
      elapsed = data.elapsed || 0;
      return true;
    } else {
      localStorage.removeItem("shapeSumGameState");
      return false;
    }
  } catch (e) {
    console.error("Could not load saved game:", e);
    return false;
  }
}

// Undo functionality
function undoLastMove() {
  if (undoStack.length === 0) return;
  redoStack.push(cloneBoardState(currentBoard));
  currentBoard = undoStack.pop();
  renderGrid();
  displayShapeTracker();
  saveGameState();
}

// Redo functionality
function redoLastMove() {
  if (redoStack.length === 0) return;
  undoStack.push(cloneBoardState(currentBoard));
  currentBoard = redoStack.pop();
  renderGrid();
  displayShapeTracker();
  saveGameState();
}

// Disable inputs after solving
function disableInputs() {
  document.querySelectorAll('.grid-cell').forEach(cell => {
    cell.classList.add('disabled-cell');
  });
  document.querySelectorAll('.sum-cell input').forEach(input => {
    input.disabled = true;
  });
  document.getElementById('checkPuzzle').innerHTML = `Share <i class="fa-solid fa-share-nodes"></i>`;
  document.getElementById('clear-game').disabled = true;
  document.getElementById('undo-button').disabled = true;
  document.getElementById('redo-button').disabled = true;
  document.getElementById('pauseButton').disabled = true;
}

// Display interactive shape tracker
function displayShapeTracker() {
  const trackerDiv = document.getElementById('shape-tracker');
  
  if (trackerDiv) {
    let html = '';
    shapeTypes.forEach(shape => {
      const savedValue = currentBoard.shapeGuesses?.[shape] || '';
      const transform = shape === 'diamond' ? 'scale(0.5) rotate(45deg)' : 'scale(0.5)';
      html += `
        <div class="flex items-start gap-2">
          <div class="shape shape-${shape}" style="transform: ${transform}; flex-shrink: 0; margin-top: 4px;"></div>
          <input 
            type="text" 
            placeholder="notes..."
            class="shape-guess-input flex-1 px-2 py-1 text-sm border-2 border-gray-400 rounded focus:border-blue-500 focus:outline-none"
            data-shape="${shape}"
            value="${savedValue}"
          />
        </div>
      `;
    });
    
    trackerDiv.innerHTML = html;
    
    // Add event listeners to save guesses
    trackerDiv.querySelectorAll('.shape-guess-input').forEach(input => {
      input.addEventListener('input', (e) => {
        if (!currentBoard.shapeGuesses) {
          currentBoard.shapeGuesses = {};
        }
        currentBoard.shapeGuesses[e.target.dataset.shape] = e.target.value;
        saveGameState();
      });
    });
  }
}

// Display test mode info
function displayTestModeInfo() {
  if (!TEST_MODE) return;
  
  const testModeDiv = document.getElementById('test-mode-info');
  const valuesDisplay = document.getElementById('shape-values-display');
  
  if (testModeDiv && valuesDisplay) {
    testModeDiv.classList.remove('hidden');
    
    let html = '<div class="space-y-2">';
    shapeTypes.forEach(shape => {
      const transform = shape === 'diamond' ? 'scale(0.6) rotate(45deg)' : 'scale(0.6)';
      html += `
        <div class="flex items-center gap-2">
          <div class="shape shape-${shape}" style="transform: ${transform};"></div>
          <span class="font-bold">${shapeValues[shape]}</span>
        </div>
      `;
    });
    html += '</div>';
    html += `<p class="text-xs mt-3 text-gray-600">Seed: ${todaySeed}</p>`;
    
    valuesDisplay.innerHTML = html;
  }
}

// Initialize game
window.addEventListener('DOMContentLoaded', () => {
  document.getElementById("daily-number").textContent = TEST_MODE ? `🧪 Test Mode - Random Seed` : `🗓️ Daily Game: ${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  
  // Generate puzzle
  solution = generatePuzzle();
  
  // Load saved state or initialize new game
  const loaded = loadGameState();
  if (!loaded) {
    currentBoard = {
      grid: solution.grid.map(row => row.map(cell => cell === '?' ? shapeTypes[0] : cell)),
      mysteryValue: '',
      shapeGuesses: {}
    };
  }
  
  renderGrid();
  displayShapeTracker();
  displayTestModeInfo();
  
  document.getElementById('timer').innerText = ` ${Math.floor(elapsed / 60)}:${(elapsed % 60).toString().padStart(2, '0')}`;
  startTimer();
  
  if (elapsed == 0) {
    showModal('welcomeModal');
    pauseTimer();
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
  
  document.getElementById('undo-button').addEventListener('click', undoLastMove);
  document.getElementById('redo-button').addEventListener('click', redoLastMove);
  
  document.getElementById('clear-game').addEventListener('click', () => {
    if (confirm("Are you sure you want to clear the puzzle and restart?")) {
      localStorage.removeItem("shapeSumGameState");
      location.reload();
    }
  });
  
  // Close modals when clicking outside
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
  
  // Close buttons
  document.querySelectorAll('[data-dismiss="modal"]').forEach(closeBtn => {
    closeBtn.addEventListener('click', () => {
      const modal = closeBtn.closest('[id$="Modal"]');
      if (modal) {
        hideModal(modal.id);
        if (modal.id === 'welcomeModal' || modal.id === 'pauseModal') {
          resumeTimer();
        }
      }
    });
  });
});

// Pause timer when window loses focus
window.addEventListener('blur', () => {
  if (!isPaused) pauseTimer();
});

window.addEventListener('focus', () => {
  const pauseModal = document.getElementById('pauseModal');
  if (pauseModal.classList.contains('hidden') && isPaused) resumeTimer();
});
