// Multiplication Connect Four - Vanilla JS

const board = [
  [1, 2, 3, 4, 5, 6, 7, 8, 9],
  [10, 12, 14, 15, 16, 18, 20, 21, 24],
  [25, 27, 28, 30, 32, 35, 36, 40, 42],
  [45, 48, 49, 54, 56, 63, 64, 72, 81]
];

let marks = [];
let turn;
let factor1;
let factor2;

function setupGame() {
  // Initialize variables for new game
  turn = 'player1';
  const turnEl = document.getElementById('turn');
  turnEl.className = 'player1';

  marks = [
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0]
  ];

  factor1 = Math.floor(Math.random() * 9) + 1;
  factor2 = Math.floor(Math.random() * 9) + 1;

  // Remove all colors from the board
  document.querySelectorAll('.factor1').forEach(el => el.classList.remove('chosen'));
  document.querySelectorAll('.factor2').forEach(el => el.classList.remove('chosen'));
  document.querySelectorAll('.board').forEach(el => {
    el.classList.remove('player1', 'player2');
  });

  // Mark the chosen factors to begin the game
  document.querySelector(`.factor1[data-id="${factor1}"]`).classList.add('chosen');
  document.querySelector(`.factor2[data-id="${factor2}"]`).classList.add('chosen');
}

function isWinner(currentTurn) {
  // Search for four in a row horizontally
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col <= 5; col++) {
      if (marks[row][col] === currentTurn &&
          marks[row][col + 1] === currentTurn &&
          marks[row][col + 2] === currentTurn &&
          marks[row][col + 3] === currentTurn) {
        return true;
      }
    }
  }

  // Search for four in a column
  for (let col = 0; col < 9; col++) {
    if (marks[0][col] === currentTurn &&
        marks[1][col] === currentTurn &&
        marks[2][col] === currentTurn &&
        marks[3][col] === currentTurn) {
      return true;
    }
  }

  // Search for four in a down-right diagonal
  for (let col = 0; col <= 5; col++) {
    if (marks[0][col] === currentTurn &&
        marks[1][col + 1] === currentTurn &&
        marks[2][col + 2] === currentTurn &&
        marks[3][col + 3] === currentTurn) {
      return true;
    }
  }

  // Search for four in an up-right diagonal
  for (let col = 3; col < 9; col++) {
    if (marks[0][col] === currentTurn &&
        marks[1][col - 1] === currentTurn &&
        marks[2][col - 2] === currentTurn &&
        marks[3][col - 3] === currentTurn) {
      return true;
    }
  }

  return false;
}

function findBoardPosition(product) {
  for (let row = 0; row < 4; row++) {
    const col = board[row].indexOf(product);
    if (col >= 0) {
      return { row, col };
    }
  }
  return null;
}

function handleFactorClick(factorType, clickedId) {
  const oldFactor = factorType === 'factor1' ? factor1 : factor2;
  const otherFactor = factorType === 'factor1' ? factor2 : factor1;
  const newFactor = parseInt(clickedId);

  // Compute new product
  const product = newFactor * otherFactor;

  // Find position on board
  const pos = findBoardPosition(product);
  if (!pos) return;

  // Check if spot was already played
  if (marks[pos.row][pos.col] !== 0) {
    alert('That product was already played. Try again.');
    return;
  }

  // Mark the product on the board
  marks[pos.row][pos.col] = turn;
  document.querySelector(`.board[data-id="${product}"]`).classList.add(turn);

  // Update factor highlighting
  document.querySelector(`.${factorType}[data-id="${oldFactor}"]`).classList.remove('chosen');
  document.querySelector(`.${factorType}[data-id="${newFactor}"]`).classList.add('chosen');

  // Update the factor variable
  if (factorType === 'factor1') {
    factor1 = newFactor;
  } else {
    factor2 = newFactor;
  }

  // Check for winner
  if (isWinner(turn)) {
    const winner = turn === 'player1' ? 'Red' : 'Green';
    setTimeout(() => alert(`${winner} wins!`), 100);
  }

  // Change turn
  const turnEl = document.getElementById('turn');
  if (turn === 'player1') {
    turn = 'player2';
  } else {
    turn = 'player1';
  }
  turnEl.classList.toggle('player1');
  turnEl.classList.toggle('player2');
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
  setupGame();

  document.getElementById('startBtn').addEventListener('click', setupGame);

  document.querySelectorAll('.factor1').forEach(el => {
    el.addEventListener('click', function() {
      handleFactorClick('factor1', this.dataset.id);
    });
  });

  document.querySelectorAll('.factor2').forEach(el => {
    el.addEventListener('click', function() {
      handleFactorClick('factor2', this.dataset.id);
    });
  });
});
