// Ruler Investigation Tool - Vanilla JS

let rulerLength = 12;
let markArray = [0, rulerLength];
let results = [];

// Utility: remove duplicates from sorted array
function unique(arr) {
  return [...new Set(arr)];
}

function rulerSetup() {
  // Clear and reset display
  document.getElementById('markNumber').textContent = '0';
  document.getElementById('lengths').textContent = rulerLength;
  
  const missingList = getMissing(getDifferences());
  printArray(missingList, '#missing');
  
  // Create the clickable ruler
  const container = document.getElementById('rulerContainer');
  container.innerHTML = '';
  
  const width = (100 / (rulerLength + 1)) - 0.2;
  
  // Start mark (0)
  const startEl = document.createElement('div');
  startEl.className = 'inch-end';
  startEl.dataset.value = '0';
  startEl.style.width = `${width}%`;
  startEl.textContent = '0';
  container.appendChild(startEl);
  
  // Middle marks (1 to rulerLength-1)
  for (let i = 1; i < rulerLength; i++) {
    const el = document.createElement('div');
    el.className = 'inch';
    el.dataset.value = String(i);
    el.style.width = `${width}%`;
    el.textContent = String(i);
    container.appendChild(el);
  }
  
  // End mark
  const endEl = document.createElement('div');
  endEl.className = 'inch-end';
  endEl.dataset.value = String(rulerLength);
  endEl.style.width = `${width}%`;
  endEl.textContent = String(rulerLength);
  container.appendChild(endEl);
  
  // Add hover tooltips
  document.querySelectorAll('.inch').forEach(el => {
    el.addEventListener('mouseenter', function() {
      const value = parseInt(this.dataset.value);
      const currentLengths = getDifferences();
      const newLengths = [];
      
      for (let i = 0; i < markArray.length; i++) {
        const diff = Math.abs(markArray[i] - value);
        if (!currentLengths.includes(diff) && diff > 0) {
          newLengths.push(diff);
        }
      }
      
      newLengths.sort((a, b) => a - b);
      const uniqueNew = unique(newLengths);
      
      let tooltipText = uniqueNew.join(', ');
      if (!tooltipText || tooltipText === '0') {
        tooltipText = 'No New Lengths';
      }
      
      this.title = tooltipText;
    });
    
    // Click handler
    el.addEventListener('click', function() {
      const value = this.dataset.value;
      
      // Skip end points
      if (value === '0' || value === String(rulerLength)) return;
      
      // Toggle the mark
      this.classList.toggle('chosen');
      
      const idx = markArray.indexOf(value);
      if (idx >= 0) {
        markArray.splice(idx, 1);
      } else {
        markArray.push(value);
      }
      
      document.getElementById('markNumber').textContent = markArray.length - 2;
      markArray.sort((a, b) => parseInt(a) - parseInt(b));
      
      const missingList = getMissing(getDifferences());
      printArray(missingList, '#missing');
      
      if (missingList.length < 1) {
        const numMarks = markArray.length - 2;
        alert(`You can measure all the distances with ${numMarks} marks.`);
        
        // Save result
        saveResult(rulerLength, numMarks, [...markArray]);
      }
    });
  });
}

function getDifferences() {
  const differences = [];
  
  // Compute all pairwise differences
  for (let i = 0; i < markArray.length - 1; i++) {
    for (let j = i + 1; j < markArray.length; j++) {
      differences.push(parseInt(markArray[j]) - parseInt(markArray[i]));
    }
  }
  
  // Sort and dedupe
  differences.sort((a, b) => a - b);
  const uniqueDiffs = unique(differences);
  
  printArray(uniqueDiffs, '#lengths');
  return uniqueDiffs;
}

function getMissing(differences) {
  const missing = [];
  for (let i = 1; i <= rulerLength; i++) {
    if (!differences.includes(i)) {
      missing.push(i);
    }
  }
  return missing;
}

function printArray(arr, selector) {
  const el = document.querySelector(selector);
  if (el) {
    el.textContent = arr.length > 0 ? arr.join(', ') : 'None!';
  }
}

function saveResult(length, marks, locations) {
  // Remove endpoints from display
  const displayLocations = locations.filter(v => v !== '0' && v !== String(length));
  
  results.push({
    length: length,
    marks: marks,
    locations: displayLocations.join(', ')
  });
  
  updateResultsTable();
}

function updateResultsTable() {
  const tbody = document.getElementById('resultsBody');
  tbody.innerHTML = '';
  
  results.forEach(result => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${result.length}</td>
      <td>${result.marks}</td>
      <td>${result.locations}</td>
    `;
    tbody.appendChild(tr);
  });
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
  rulerSetup();
  
  // Set ruler length button
  document.getElementById('setLengthBtn').addEventListener('click', function() {
    const input = parseInt(document.getElementById('rulerLength').value);
    
    if (isNaN(input)) {
      alert('Please enter a ruler length.');
      return;
    }
    
    if (input < 6 || input > 36) {
      alert('Ruler must be between 6 and 36.');
      return;
    }
    
    rulerLength = input;
    markArray = [0, rulerLength];
    rulerSetup();
  });
  
  // Reset button
  document.getElementById('resetBtn').addEventListener('click', function() {
    if (confirm('Are you sure you want to reset all marks on the ruler?')) {
      markArray = [0, rulerLength];
      rulerSetup();
    }
  });
});
