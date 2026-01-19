    const operations = ['+', '-', '*', '/'];
    let cards = [];
    let originalCards = [];
    let solution = null;
    let dragSource = null;
    let currentTarget = null;
    let tryCount = 1;
    const maxTries = 4;
    let selectedCardIndex1 = null;
    let selectedOperator = null;
    let selectedCardIndex2 = null;
    let attemptsMatrix = [];
    let currentAttempt = [];
    let gameOver = false;
    const storageKey = 'daily24game';
    const statsKey = 'daily24stats';

    function getTodayId() {
      const d = new Date();
      return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    }

    function showAttemptsMatrix() {
      const matrixContainer = document.getElementById("attempts-matrix");
      matrixContainer.innerHTML = ""; // Clear previous content

      const numberEmoji = ["0️⃣", "1️⃣", "2️⃣", "3️⃣", "4️⃣"];
      const operationEmojiMap = {
        "+": "➕",
        "-": "➖",
        "*": "✖️",
        "/": "➗"
      };

      attemptsMatrix.forEach((attempt, index) => {
        const rowDiv = document.createElement("div");
        rowDiv.classList.add("attempts-row");

        let rowText = numberEmoji[index + 1] || `${index + 1}️⃣`;

        for (let i = 0; i < 3; i++) {
          const op = attempt.operations[i];
          rowText += op ? operationEmojiMap[op] || "⬜️" : "⬜️";
        }

        rowText += attempt.didWin ? "🎯" : "❌";

        rowDiv.textContent = rowText;
        matrixContainer.appendChild(rowDiv);
      });
    }

    function recordAttempt(operations, didWin) {
      attemptsMatrix.push({
        attemptNumber: attemptsMatrix.length + 1,
        operations: operations,  // array of operations (could be [])
        didWin: didWin           // true or false
      });

      // if (didWin) {
      //   saveDailyStats(true, attemptsMatrix.length);
      // } else if (attemptsMatrix.length === maxTries) {
      //   saveDailyStats(false, 'X');
      // }

      // saveGameState() // Save the game state after each attempt
    }
    
    function seedRandom(seed) {
      let x = Math.sin(seed) * 10000;
      return x - Math.floor(x);
    }

    function getTodaySeed() {
      const today = new Date();
      return today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
    }

    function generateSeededCards(seed) {
      const nums = [];
      for (let i = 0; i < 4; i++) {
        const value = Math.floor(seedRandom(seed + i) * 9) + 1;
        nums.push(value);
      }
      return nums;
    }

    function setupGame() {
      const seed = getTodaySeed();
      let found = false;
      let offset = 0;
      
      while (!found && offset < 1000) {
        const potentialCards = generateSeededCards(seed + offset);
        const potentialSolution = findSolution(potentialCards);
        if (potentialSolution) {
          cards = potentialCards;
          originalCards = [...cards];
          solution = potentialSolution;
          found = true;
        } else {
          offset++;
        }
      }
      gameEngine();
      // document.getElementById('solution').textContent = '';
    }

    function tryAgain() {
      tryCount++;

      if (tryCount > maxTries) {
        document.getElementById("try-again-button").disabled = true;
        endGame(false);
        // document.getElementById('solution').textContent = `Out of tries! One solution is: ${solution}`;
        return;
      } else {
        document.getElementById('try-counter').textContent = `Attempt: ${tryCount} of ${maxTries}`;
      }

      cards = [...originalCards];
      gameEngine();
      document.getElementById('solution').textContent = '';

      recordAttempt(currentAttempt,false); // after a failure
      currentAttempt = [];
      // saveGameState() // Save the game state after each attempt
    }

    function revealSolution() {
      const solutionElement = document.getElementById('solution');
      solutionElement.innerHTML = solution ? `Solution: <code>${solution}</code> = 24` : "No solution found";
    }

    function highlightSelectedOperation() {
      const operationButtons = document.querySelectorAll('.operation-button');
      operationButtons.forEach(btn => {
        if (btn.getAttribute('data-operator') === selectedOperator) {
          btn.classList.add('btn-success');
          btn.classList.remove('btn-outline-success');
        } else {
          btn.classList.add('btn-outline-success');
          btn.classList.remove('btn-success');
        }
      });
    }

    function selectOperator(op) {
      if (selectedCardIndex1 !== null) {
        selectedOperator = op;
      }
      highlightSelectedOperation();
    }

    function resetSelection() {
      if (selectedCardIndex1 !== null) {
        const card = document.getElementById(`card-${selectedCardIndex1}`);
        card.classList.add('shake');

        // Remove shake class after animation finishes so it can be reused
        setTimeout(() => {
          card.classList.remove('shake');
        }, 400);
      }
      selectedCardIndex1 = null;
      selectedOperator = null;
      selectedCardIndex2 = null;
      highlightSelectedOperation(); // clear operator highlight too
      highlightCards(); // Also clear highlights
    }

    function highlightCards() {
      const cardsDOM = document.querySelectorAll('.card-box');
      cardsDOM.forEach((card, idx) => {
        card.classList.remove('highlight');
        if (idx === selectedCardIndex1 || idx === selectedCardIndex2) {
          card.classList.add('highlight');
        }
      });
    }

    function gameEngine() {
      const container = document.getElementById('cards');
      container.innerHTML = '';
      cards.forEach((value, index) => {
        const card = document.createElement('div');
        card.className = 'card-box';
        card.textContent = Math.round(value);
        card.draggable = true;
        card.dataset.index = index;
        card.id = `card-${index}`;

        if (value !== null) {
          card.textContent = Math.round(value);

          card.onclick = () => {
            if (selectedCardIndex1 === null) {
              // No card selected yet → select first card
              selectedCardIndex1 = index;
              highlightCards();
            } else if (selectedCardIndex1 === index && selectedCardIndex2 === null) {
              // Clicking again on the same first card → unselect it and clear operation
              resetSelection();
              highlightCards();
            } else if (selectedCardIndex1 !== null && selectedOperator === null) {
              // Card already selected but no operator yet → allow changing first card
              selectedCardIndex1 = index;
              highlightCards();
            } else if (selectedCardIndex1 !== null && selectedOperator !== null && index !== selectedCardIndex1) {
              // First card and operator selected, now picking second card
              selectedCardIndex2 = index;
              highlightCards();
              performOperation();
              currentAttempt.push(selectedOperator);
            }
          };
        } else {
          card.style.visibility = "hidden"; // empty spot
        }
        container.appendChild(card);
      });
    }

    function performOperation() {
      const a = cards[selectedCardIndex1];
      const b = cards[selectedCardIndex2];
      let result;
      // console.log(`Performing operation: ${a} ${selectedOperator} ${b}`);
      if (selectedOperator === '/' && b === 0) {
        alert("Division by zero!");
        return;
      }

      switch (selectedOperator) {
        case '+': result = a + b; break;
        case '-': result = Math.abs(a - b); break;
        case '*': result = a * b; break;
        case '/': result = a / b; break;
      }

      if (!Number.isInteger(result)) {
        // playSound('errorSound');
        resetSelection();
        return;
      }
      // Animate moving selectedCard1 onto selectedCard2
      const card1 = document.getElementById(`card-${selectedCardIndex1}`);
      const card2 = document.getElementById(`card-${selectedCardIndex2}`);
      
      const rect1 = card1.getBoundingClientRect();
      const rect2 = card2.getBoundingClientRect();
      
      const deltaX = rect2.left - rect1.left;
      const deltaY = rect2.top - rect1.top;

      card1.style.transition = "transform 0.5s ease";
      card1.style.transform = `translate(${deltaX}px, ${deltaY}px)`;

      setTimeout(() => {
        // Update the cards without shrinking the array
        cards[selectedCardIndex2] = result; // Second card becomes result
        cards[selectedCardIndex1] = null;   // First card becomes blank

        resetSelection();
        gameEngine();

        checkForWin();

      }, 500); // matches the CSS transition time
    }

    function checkForWin() {
      const nonNullCards = cards.filter(card => card !== null);
      if (nonNullCards.length === 1 && nonNullCards[0] === 24) {
        // Trigger win effect animation
        animateWin();
        document.getElementById("try-again-button").disabled = true;
        recordAttempt(currentAttempt, true); // after a win
        // Add delay before showing the game over popup
        setTimeout(function() {
          endGame(true);
        }, 2000);  // 1000ms delay (same duration as the animation)
      }
    }

    function animateWin() {
      // Simple burst of confetti
      confetti({
        particleCount: 150,
        spread: 70,
        origin: { y: 0.6 },
      });
    }

    function endGame(didWin) {
      myModal = new bootstrap.Modal(document.getElementById('endgame-Modal'));
      myModal.show();
      const message = document.getElementById("game-result-message");
      message.textContent = didWin ? "🎉 Problem Solved! 🎉" : "I tried! 😞";
      showAttemptsMatrix(); // This function creates emoji grid text
      document.getElementById("share-button").addEventListener("click", () => {
        const modalBody = document.querySelector('#endgame-Modal .modal-body');
        let originalText = modalBody.innerText;
        // Remove the word "Share"
        originalText = originalText.replace(/\bShare\b\s*/g, '').trim();
        // Define title and link (in plain-text form for max compatibility)
        const titleWithLink = "https://drrajshah.com/games/24game/";
        // Build plain-text output
        const plainText = `Dr. Shah's Daily 24 Challenge\n${originalText}\n\n${titleWithLink}`;
        navigator.clipboard.writeText(plainText).then(() => {
          alert("Copied to clipboard!");
        }).catch(err => {
          console.error("Clipboard copy failed:", err);
          alert("Failed to copy to clipboard.");
        });
      });
    }

    function evaluate(expr) {
      try {
        const result = eval(expr);
        return Math.abs(result - 24) < 1e-6;
      } catch {
        return false;
      }
    }

    function permutations(arr) {
      if (arr.length <= 1) return [arr];
      const result = [];
      for (let i = 0; i < arr.length; i++) {
        const rest = permutations(arr.slice(0, i).concat(arr.slice(i + 1)));
        for (let perm of rest) {
          result.push([arr[i]].concat(perm));
        }
      }
      return result;
    }

    function getOperationCombos() {
      const combos = [];
      for (let a of operations) {
        for (let b of operations) {
          for (let c of operations) {
            combos.push([a, b, c]);
          }
        }
      }
      return combos;
    }

    function generateExpressions(nums, ops) {
      const [a, b, c, d] = nums;
      const [op1, op2, op3] = ops;
      return [
        `(${a}${op1}${b})${op2}(${c}${op3}${d})`,
        `(((${a}${op1}${b})${op2}${c})${op3}${d})`,
        `(${a}${op1}(${b}${op2}${c}))${op3}${d}`,
        `${a}${op1}(((${b}${op2}${c})${op3}${d}))`,
        `(${a}${op1}${b}${op2}${c})${op3}${d}`
      ];
    }

    function findSolution(cards) {
      const perms = permutations(cards);
      const opCombos = getOperationCombos();

      for (let nums of perms) {
        for (let ops of opCombos) {
          const expressions = generateExpressions(nums, ops);
          for (let expr of expressions) {
            if (evaluate(expr)) {
              return expr;
            }
          }
        }
      }
      return null;
    }

    // function saveGameState() {
    //   localStorage.setItem(storageKey, JSON.stringify({
    //     date: getTodayId(),
    //     attemptsMatrix: attemptsMatrix,
    //   }));
    // }

    // function saveDailyStats(didWin, tries) {
    //   const stats = JSON.parse(localStorage.getItem(statsKey)) || {};
    //   const todayId = getTodayId();
    //   stats[todayId] = { didWin, tries };
    //   localStorage.setItem(statsKey, JSON.stringify(stats));
    // }

    // Initialize on page load
    window.onload = function() {
      const todayId = getTodayId();
      document.getElementById("daily-number").textContent = `🗓️ Daily Game: ${todayId}`;

      const savedState = JSON.parse(localStorage.getItem(storageKey));
      if (savedState && savedState.date === todayId) {
        attemptsMatrix = savedState.attemptsMatrix || [];
        tryCount = attemptsMatrix.length + 1;
        document.getElementById('try-counter').textContent = `Attempt: ${tryCount} of ${maxTries}`;
      } else {
        localStorage.removeItem(storageKey);  // wipe old state
        attemptsMatrix = [];
        tryCount = 1;
        document.getElementById('try-counter').textContent = `Attempt: 1 of ${maxTries}`;
      }
      setupGame();
    }
