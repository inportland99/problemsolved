// Eight Queens Puzzle - Vanilla JS

let board = [];
let dimension = 8;
let best = 0;
let count = 0;
let helperMode = false;

function setupGame() {
  // Initialize 8x8 board array
  board = [];
  for (let i = 0; i < 8; i++) {
    board[i] = new Array(8).fill(0);
  }
  drawBoard();
}

function shrinkBoard(newDimension) {
  setupGame();
  dimension = newDimension;
  
  // Show all cells first
  document.querySelectorAll('.board-cell').forEach(cell => {
    cell.style.display = '';
  });
  
  // Set table width based on dimension
  const tableWidth = dimension * 60;
  document.getElementById('chessBoard').style.width = `${tableWidth}px`;
  
  // Hide cells outside the current dimension
  document.querySelectorAll('.board-cell').forEach(cell => {
    const row = parseInt(cell.dataset.row);
    const col = parseInt(cell.dataset.col);
    
    if (row > dimension || col > dimension) {
      cell.style.display = 'none';
    }
  });
  
  updateButtons();
}

function updateButtons() {
  // Reset all button text
  document.querySelectorAll('.start').forEach(btn => {
    const size = btn.dataset.size;
    btn.textContent = `Try ${size}×${size}`;
    btn.classList.remove('btn-error');
    btn.classList.add('btn-info');
  });
  
  // Update current dimension button if queens are placed
  if (count > 0) {
    const currentBtn = document.querySelector(`.start[data-size="${dimension}"]`);
    if (currentBtn) {
      currentBtn.textContent = `Reset ${dimension}×${dimension}`;
      currentBtn.classList.remove('btn-info');
      currentBtn.classList.add('btn-error');
    }
  }
  
  // Show/hide helper mode based on dimension
  const helperLabel = document.getElementById('helperLabel');
  if (dimension < 9) {
    helperLabel.style.display = '';
  } else {
    helperLabel.style.display = 'none';
    helperMode = false;
    document.getElementById('helperMode').checked = false;
    document.getElementById('checkBtn').disabled = false;
  }
}

function drawBoard() {
  count = 0;
  
  // Reset attack tracking (keep odd values = queens, clear even attack markers)
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 8; j++) {
      if (board[i][j] % 2 === 0) {
        board[i][j] = 0;
      } else {
        board[i][j] = 1;
      }
    }
  }
  
  // Calculate attacks from all queens
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 8; j++) {
      if (board[i][j] % 2 === 1) {
        count++;
        if (count > best) best = count;
        
        // Mark all cells attacked by this queen
        // Right
        for (let k = j + 1; k < 8; k++) board[i][k] += 2;
        // Left
        for (let k = j - 1; k >= 0; k--) board[i][k] += 2;
        // Up
        for (let k = i + 1; k < 8; k++) board[k][j] += 2;
        // Down
        for (let k = i - 1; k >= 0; k--) board[k][j] += 2;
        // Up-right diagonal
        for (let l = i + 1, k = j + 1; k < 8 && l < 8; l++, k++) board[l][k] += 2;
        // Down-left diagonal
        for (let l = i - 1, k = j - 1; k >= 0 && l >= 0; l--, k--) board[l][k] += 2;
        // Up-left diagonal
        for (let l = i + 1, k = j - 1; k >= 0 && l < 8; l++, k--) board[l][k] += 2;
        // Down-right diagonal
        for (let l = i - 1, k = j + 1; k < 8 && l >= 0; l--, k++) board[l][k] += 2;
      }
    }
  }
  
  // Update visual board
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 8; j++) {
      const cell = document.querySelector(`[data-row="${i + 1}"][data-col="${j + 1}"]`);
      if (!cell) continue;
      
      cell.classList.remove('queen', 'red-queen', 'attacked');
      
      if (board[i][j] % 2 === 1) {
        cell.classList.add('queen');
      } else if (helperMode && board[i][j] > 0 && board[i][j] % 2 === 0) {
        cell.classList.add('attacked');
      }
    }
  }
  
  updateButtons();
  
  // Check for solution in helper mode
  if (helperMode && count === dimension) {
    setTimeout(() => alert(`Your efforts paid off!\nYou solved the ${dimension}×${dimension} puzzle!`), 500);
  }
}

function checkBoard() {
  let failCount = 0;
  
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 8; j++) {
      if (board[i][j] > 1 && board[i][j] % 2 === 1) {
        const cell = document.querySelector(`[data-row="${i + 1}"][data-col="${j + 1}"]`);
        if (cell) cell.classList.add('red-queen');
        failCount++;
      }
    }
  }
  
  if (failCount > 0) {
    setTimeout(() => alert(`There are ${failCount} queens that are attacking each other.\nThey are highlighted in red.\nKeep working on it!`), 500);
  } else if (count < dimension) {
    setTimeout(() => alert(`So far so good!\n${dimension - count} queens to go.`), 500);
  } else {
    setTimeout(() => alert(`Your efforts paid off!\nYou solved the ${dimension}×${dimension} puzzle!`), 500);
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
  setupGame();
  
  // Initially hide helper mode for 8x8
  document.getElementById('helperLabel').style.display = 'none';
  
  // Board cell clicks
  document.querySelectorAll('.board-cell').forEach(cell => {
    cell.addEventListener('click', function() {
      const row = parseInt(this.dataset.row) - 1;
      const col = parseInt(this.dataset.col) - 1;
      
      // Check bounds for current dimension
      if (row >= dimension || col >= dimension) return;
      
      if (this.classList.contains('attacked')) {
        alert("You can't place a Queen there!\nIt's already being attacked.\nTry again.");
      } else if (this.classList.contains('queen')) {
        board[row][col] = 0;
        drawBoard();
      } else {
        board[row][col] = 1;
        drawBoard();
      }
    });
  });
  
  // Size buttons
  document.querySelectorAll('.start').forEach(btn => {
    btn.addEventListener('click', function() {
      if (count > 0) {
        if (!confirm('This will erase your work.\nDo you want to continue?')) {
          return;
        }
      }
      
      const newDimension = parseInt(this.dataset.size);
      if (newDimension !== dimension) {
        best = 0;
      }
      count = 0;
      shrinkBoard(newDimension);
    });
  });
  
  // Check button
  document.getElementById('checkBtn').addEventListener('click', checkBoard);
  
  // Helper mode toggle
  document.getElementById('helperMode').addEventListener('change', function() {
    if (count > 0) {
      if (!confirm('This will erase your work.\nDo you want to continue?')) {
        this.checked = helperMode;
        return;
      }
    }
    
    helperMode = this.checked;
    document.getElementById('checkBtn').disabled = helperMode;
    count = 0;
    shrinkBoard(dimension);
  });
});
