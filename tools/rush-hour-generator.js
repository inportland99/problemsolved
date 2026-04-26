#!/usr/bin/env node
/**
 * Rush Hour reverse-BFS puzzle generator.
 *
 * Move semantics: each single-cell slide is one move, matching the UI's
 * tryMove() in src/assets/js/rush-hour.js. So the BFS distance equals the
 * UI's move counter, which makes "par" honest for the player.
 *
 * Output schema matches the PUZZLES array in rush-hour.js:
 *   { id, row, col, length, dir: 'H'|'V', isTarget }
 *
 * Usage:
 *   node tools/rush-hour-generator.js [options]
 *
 * Options:
 *   --seeds N             how many random seed boards to BFS (default 30)
 *   --vehicle-count N     non-target vehicles per seed (default 11; total = 12)
 *   --per-difficulty N    keep top N per difficulty bucket (default 30)
 *   --output PATH         output JSON (default src/_data/rushHourPuzzles.json)
 *   --rng-seed N          deterministic RNG seed (default 1)
 *   --max-depth N         BFS depth cap (default 60)
 *   --verify              run BFS on the three built-in PUZZLES instead of generating
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ─── Constants ──────────────────────────────────────────────────────────────
const GRID = 6;
const EXIT_ROW = 2;

// Single-cell-move difficulty bands (matches UI's tryMove counting one move per cell).
const DIFFICULTY_BANDS = {
  easy:     { min: 4,  max: 12 },
  moderate: { min: 15, max: 25 },
  hard:     { min: 28, max: 42 },
  expert:   { min: 45, max: 90 },
};

// IDs available for non-target vehicles. 'T' is reserved for the target car.
const NON_TARGET_IDS = 'ABCDEFGHIJKLMNOPQRSUVWXYZ'; // 25 chars (no 'T')

// ─── Tiny seedable RNG (Mulberry32) ────────────────────────────────────────
function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── State encoding ─────────────────────────────────────────────────────────
// State = positions array, one [row, col] per vehicle (in inventory order).
// Inventory (id, length, dir, isTarget) is fixed for one BFS run.
//
// Each (row, col) packs to a single char (codes 65..100 for cells 0..35),
// so a state's key is a short fixed-length string we can use as a Map key.

function encode(positions) {
  let s = '';
  for (let i = 0; i < positions.length; i++) {
    const p = positions[i];
    s += String.fromCharCode(65 + p[0] * GRID + p[1]);
  }
  return s;
}

function decode(key) {
  const out = new Array(key.length);
  for (let i = 0; i < key.length; i++) {
    const v = key.charCodeAt(i) - 65;
    out[i] = [(v / GRID) | 0, v % GRID];
  }
  return out;
}

// ─── Occupancy + move generation ────────────────────────────────────────────

/** Build a 6×6 occupancy grid: occ[r][c] = vehicle index, or -1. */
function buildOcc(positions, inventory) {
  const occ = [];
  for (let r = 0; r < GRID; r++) {
    const row = new Int8Array(GRID);
    row.fill(-1);
    occ.push(row);
  }
  for (let i = 0; i < inventory.length; i++) {
    const v = inventory[i];
    const r = positions[i][0];
    const c = positions[i][1];
    for (let k = 0; k < v.length; k++) {
      const rr = v.dir === 'V' ? r + k : r;
      const cc = v.dir === 'H' ? c + k : c;
      occ[rr][cc] = i;
    }
  }
  return occ;
}

/**
 * Generate single-cell-slide neighbors of `positions`.
 * Returns array of { vehicleIndex, delta, positions } where delta ∈ {-1, +1}.
 */
function neighbors(positions, inventory) {
  const occ = buildOcc(positions, inventory);
  const out = [];
  for (let i = 0; i < inventory.length; i++) {
    const v = inventory[i];
    const r = positions[i][0];
    const c = positions[i][1];
    for (const delta of [-1, 1]) {
      let leadR, leadC, newR = r, newC = c;
      if (v.dir === 'H') {
        newC = c + delta;
        leadR = r;
        leadC = delta > 0 ? newC + v.length - 1 : newC;
      } else {
        newR = r + delta;
        leadR = delta > 0 ? newR + v.length - 1 : newR;
        leadC = c;
      }
      if (leadR < 0 || leadR >= GRID || leadC < 0 || leadC >= GRID) continue;
      if (occ[leadR][leadC] !== -1 && occ[leadR][leadC] !== i) continue;
      const newPos = positions.slice();
      newPos[i] = [newR, newC];
      out.push({ vehicleIndex: i, delta, positions: newPos });
    }
  }
  return out;
}

// ─── Reverse BFS (multi-source over won states) ──────────────────────
//
// The UI treats ANY state with target.col + length - 1 >= GRID-1 as solved,
// not just one canonical "solved" arrangement. So we need dist[s] to be the
// true minimum moves from s to *any* won state — not to a single seed.
//
// Two-pass approach:
//   1. Enumerate the connected component reachable from the seed.
//   2. Multi-source BFS from every won state in the component, with all of
//      them at distance 0. The result: dist[s] = true min moves to win.
//
// Because moves are reversible the seed need only be a representative point
// in the component — any won state will produce the same dist map.
function reverseBfs(seedPositions, inventory, maxDepth) {
  const targetIdx = inventory.findIndex((v) => v.isTarget);
  const winCol = GRID - inventory[targetIdx].length;

  // Pass 1: enumerate the component.
  const startKey = encode(seedPositions);
  const component = new Set([startKey]);
  let frontier = [startKey];
  let depth = 0;
  while (frontier.length > 0 && depth < maxDepth) {
    const next = [];
    for (let i = 0; i < frontier.length; i++) {
      const positions = decode(frontier[i]);
      const moves = neighbors(positions, inventory);
      for (let j = 0; j < moves.length; j++) {
        const k2 = encode(moves[j].positions);
        if (!component.has(k2)) { component.add(k2); next.push(k2); }
      }
    }
    frontier = next;
    depth++;
  }

  // Pass 2: collect every won state in the component.
  const wonKeys = [];
  for (const k of component) {
    const positions = decode(k);
    if (positions[targetIdx][0] === EXIT_ROW &&
        positions[targetIdx][1] >= winCol) {
      wonKeys.push(k);
    }
  }

  // Pass 3: multi-source BFS from won states.
  const dist = new Map();
  for (const k of wonKeys) dist.set(k, 0);
  let mFrontier = wonKeys.slice();
  let mDepth = 0;
  while (mFrontier.length > 0) {
    const next = [];
    for (let i = 0; i < mFrontier.length; i++) {
      const positions = decode(mFrontier[i]);
      const moves = neighbors(positions, inventory);
      for (let j = 0; j < moves.length; j++) {
        const k2 = encode(moves[j].positions);
        if (!dist.has(k2)) { dist.set(k2, mDepth + 1); next.push(k2); }
      }
    }
    mFrontier = next;
    mDepth++;
  }
  return dist;
}

// ─── Seed generation ────────────────────────────────────────────────────────

/**
 * Random "solved" board: target at (row 2, col 4) plus N other vehicles.
 * Returns { inventory, positions } or null on failure.
 */
function generateSeed(rng, otherCount, truckRatio = 0.25) {
  const inventory = [{ id: 'T', length: 2, dir: 'H', isTarget: true }];
  const positions = [[EXIT_ROW, GRID - 2]]; // target leftmost cell at col 4

  let attempts = 0;
  const maxAttempts = otherCount * 200;
  let nextIdIdx = 0;

  while (inventory.length - 1 < otherCount && attempts < maxAttempts) {
    attempts++;
    const length = rng() < truckRatio ? 3 : 2;
    const dir = rng() < 0.5 ? 'H' : 'V';
    let r, c;
    if (dir === 'H') {
      r = Math.floor(rng() * GRID);
      c = Math.floor(rng() * (GRID - length + 1));
    } else {
      r = Math.floor(rng() * (GRID - length + 1));
      c = Math.floor(rng() * GRID);
    }

    // Overlap check against current placement.
    const occ = buildOcc(positions, inventory);
    let collides = false;
    for (let k = 0; k < length; k++) {
      const rr = dir === 'V' ? r + k : r;
      const cc = dir === 'H' ? c + k : c;
      if (occ[rr][cc] !== -1) { collides = true; break; }
    }
    if (collides) continue;

    if (nextIdIdx >= NON_TARGET_IDS.length) break;
    inventory.push({
      id: NON_TARGET_IDS[nextIdIdx++],
      length,
      dir,
      isTarget: false,
    });
    positions.push([r, c]);
  }

  if (inventory.length - 1 < otherCount) return null;
  return { inventory, positions };
}

// ─── Global DP over the optimal-edge DAG ────────────────────────────────────
//
// For every reachable state s, precompute:
//   paths[s]      – number of distinct optimal paths from s to a depth-0 state
//   movedBits[s]  – bitmask of vehicle indices that move on ANY optimal path
//
// DP order: dist-ascending. Base case: dist[s]==0 → paths=1, movedBits=0.
// Recurrence: for each neighbor n with dist[n] = dist[s]-1,
//   paths[s]     += paths[n]
//   movedBits[s] |= movedBits[n] | bit(vehicleIndex of move s→n)
//
// Total work: O(|V| · avg_neighbors). Linear in the explored state space.
function computeGlobalDP(dist, inventory) {
  // Bucket keys by depth.
  let maxD = 0;
  for (const d of dist.values()) if (d > maxD) maxD = d;
  const byDist = new Array(maxD + 1);
  for (let i = 0; i <= maxD; i++) byDist[i] = [];
  for (const [k, d] of dist) byDist[d].push(k);

  const paths = new Map();
  const movedBits = new Map();

  // Depth 0 base case.
  for (const k of byDist[0]) { paths.set(k, 1); movedBits.set(k, 0); }

  for (let d = 1; d <= maxD; d++) {
    const layer = byDist[d];
    for (let li = 0; li < layer.length; li++) {
      const k = layer[li];
      const positions = decode(k);
      const moves = neighbors(positions, inventory);
      let sum = 0;
      let bits = 0;
      for (let mi = 0; mi < moves.length; mi++) {
        const m = moves[mi];
        const k2 = encode(m.positions);
        if (dist.get(k2) === d - 1) {
          sum += paths.get(k2);
          if (sum > 1e12) sum = 1e12;
          bits |= movedBits.get(k2) | (1 << m.vehicleIndex);
        }
      }
      paths.set(k, sum);
      movedBits.set(k, bits);
    }
  }
  return { paths, movedBits };
}

function popcount32(n) {
  let c = 0;
  while (n) { c += n & 1; n >>>= 1; }
  return c;
}

// ─── Per-candidate scoring (cheap, uses global DP results) ─────────────────

/**
 * Score one candidate state by walking ONE deterministic optimal path for
 * per-step features (branching, red-backward) and reading global DP for
 * structural features (uniquePaths, vehiclesMoved).
 */
function scoreCandidate(candKey, candPositions, inventory, dist, paths, movedBits) {
  const d = dist.get(candKey);
  if (d === 0) return null;

  let cur = candPositions;
  let totalBranching = 0;
  let redBackward = 0;
  let pathStates = 0;
  while (true) {
    const k = encode(cur);
    const dHere = dist.get(k);
    if (dHere === 0) break;
    const allMoves = neighbors(cur, inventory);
    totalBranching += allMoves.length;
    pathStates++;
    let chosen = null;
    for (let i = 0; i < allMoves.length; i++) {
      if (dist.get(encode(allMoves[i].positions)) === dHere - 1) {
        chosen = allMoves[i];
        break;
      }
    }
    if (!chosen) break; // shouldn't happen on a reachable state
    if (inventory[chosen.vehicleIndex].isTarget && chosen.delta === -1) redBackward++;
    cur = chosen.positions;
  }

  return {
    minMoves: d,
    uniqueOptimalPaths: paths.get(candKey),
    vehiclesMoved: popcount32(movedBits.get(candKey)),
    redBackwardMoves: redBackward,
    avgBranching: pathStates > 0 ? totalBranching / pathStates : 0,
  };
}

function compositeScore(m) {
  return (
    1.0 * m.minMoves +
    0.5 * m.vehiclesMoved +
    0.8 * m.redBackwardMoves +
    0.3 * m.avgBranching -
    0.6 * Math.log(Math.max(1, m.uniqueOptimalPaths))
  );
}

function difficultyOf(minMoves) {
  for (const k of Object.keys(DIFFICULTY_BANDS)) {
    const b = DIFFICULTY_BANDS[k];
    if (minMoves >= b.min && minMoves <= b.max) return k;
  }
  return null;
}

function positionsToVehicles(positions, inventory) {
  return inventory.map((v, i) => ({
    id: v.id,
    row: positions[i][0],
    col: positions[i][1],
    length: v.length,
    dir: v.dir,
    isTarget: v.isTarget,
  }));
}

// ─── Validity sanity check ─────────────────────────────────────────────────
function validateVehicles(vehicles) {
  // No overlap, in bounds, exactly one target on row 2 dir H.
  let target = 0;
  const occ = [];
  for (let r = 0; r < GRID; r++) occ.push(new Int8Array(GRID));
  for (let i = 0; i < vehicles.length; i++) {
    const v = vehicles[i];
    if (v.isTarget) {
      target++;
      if (v.row !== EXIT_ROW || v.dir !== 'H') return false;
    }
    for (let k = 0; k < v.length; k++) {
      const r = v.dir === 'V' ? v.row + k : v.row;
      const c = v.dir === 'H' ? v.col + k : v.col;
      if (r < 0 || r >= GRID || c < 0 || c >= GRID) return false;
      if (occ[r][c]) return false;
      occ[r][c] = 1;
    }
  }
  return target === 1;
}

// ─── Generation pipeline ────────────────────────────────────────────────────

function generate(opts) {
  const rng = mulberry32(opts.rngSeed);
  const buckets = { easy: [], moderate: [], hard: [], expert: [] };
  const seenAcrossSeeds = new Set();
  let totalStates = 0;

  for (let s = 0; s < opts.seeds; s++) {
    const seed = generateSeed(rng, opts.vehicleCount);
    if (!seed) {
      console.error(`[seed ${s}] could not place ${opts.vehicleCount} vehicles, skipping`);
      continue;
    }
    const t0 = Date.now();
    const dist = reverseBfs(seed.positions, seed.inventory, opts.maxDepth);
    const tBfs = Date.now() - t0;
    totalStates += dist.size;

    const t1 = Date.now();
    const { paths, movedBits } = computeGlobalDP(dist, seed.inventory);
    const tDp = Date.now() - t1;
    console.error(`[seed ${s}] BFS: ${dist.size} states (${tBfs}ms) · DP: ${tDp}ms`);

    // Pre-filter: only keep states inside any difficulty band.
    const candidates = [];
    for (const [k, d] of dist) {
      const diff = difficultyOf(d);
      if (!diff) continue;
      // Cross-seed dedupe: shape fingerprint distinguishes states across seeds.
      const fingerprint = fingerprintState(seed.inventory, decode(k));
      if (seenAcrossSeeds.has(fingerprint)) continue;
      seenAcrossSeeds.add(fingerprint);
      candidates.push({ k, d, diff });
    }

    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      const positions = decode(c.k);
      const metrics = scoreCandidate(c.k, positions, seed.inventory, dist, paths, movedBits);
      if (!metrics) continue;
      buckets[c.diff].push({
        score: compositeScore(metrics),
        metrics,
        vehicles: positionsToVehicles(positions, seed.inventory),
      });
    }
  }

  // Top-N per bucket.
  const result = {};
  for (const k of Object.keys(buckets)) {
    buckets[k].sort((a, b) => b.score - a.score);
    result[k] = buckets[k].slice(0, opts.perDifficulty).map((x) => ({
      difficulty: k,
      minMoves: x.metrics.minMoves,
      vehiclesMoved: x.metrics.vehiclesMoved,
      redBackwardMoves: x.metrics.redBackwardMoves,
      uniqueOptimalPaths: x.metrics.uniqueOptimalPaths,
      avgBranching: Number(x.metrics.avgBranching.toFixed(2)),
      score: Number(x.score.toFixed(2)),
      vehicles: x.vehicles,
    }));
  }

  // Final validity check on every emitted puzzle.
  for (const k of Object.keys(result)) {
    for (const p of result[k]) {
      if (!validateVehicles(p.vehicles)) {
        throw new Error(`generated puzzle failed validity check: ${JSON.stringify(p)}`);
      }
    }
  }

  console.error(`Total reachable states explored: ${totalStates}`);
  return result;
}

// Fingerprint that distinguishes states across different seed inventories.
// Uses a canonical grid-cell-to-shape representation, ignoring vehicle IDs
// (which are arbitrary letters) but keeping length/direction/target.
function fingerprintState(inventory, positions) {
  // Build a 6×6 grid where each cell encodes (length, dir, isTarget) of its
  // occupying vehicle. Two states with the same shape pattern → same fingerprint.
  const cells = new Array(GRID * GRID).fill('.');
  for (let i = 0; i < inventory.length; i++) {
    const v = inventory[i];
    const tag = (v.isTarget ? 'X' : '') + v.length + v.dir;
    const r = positions[i][0], c = positions[i][1];
    for (let k = 0; k < v.length; k++) {
      const rr = v.dir === 'V' ? r + k : r;
      const cc = v.dir === 'H' ? c + k : c;
      cells[rr * GRID + cc] = tag + ':' + i; // include i so two equal-shape pieces aren't merged
    }
  }
  return cells.join('|');
}

// ─── Verification mode (BFS on the three built-in puzzles) ─────────────────

function verifyBuiltInPuzzles() {
  // Mirrors the three PUZZLES entries in src/assets/js/rush-hour.js so we
  // can confirm the BFS depth matches the documented ~5/~7/~8 move solutions.
  const builtIn = [
    [
      { id: 'T', row: 2, col: 0, length: 2, dir: 'H', isTarget: true },
      { id: 'B', row: 1, col: 2, length: 2, dir: 'V', isTarget: false },
      { id: 'C', row: 3, col: 3, length: 2, dir: 'H', isTarget: false },
    ],
    [
      { id: 'T', row: 2, col: 0, length: 2, dir: 'H', isTarget: true },
      { id: 'A', row: 2, col: 2, length: 2, dir: 'V', isTarget: false },
      { id: 'B', row: 1, col: 3, length: 3, dir: 'V', isTarget: false },
    ],
    [
      { id: 'T', row: 2, col: 1, length: 2, dir: 'H', isTarget: true },
      { id: 'A', row: 1, col: 3, length: 2, dir: 'V', isTarget: false },
      { id: 'B', row: 2, col: 4, length: 2, dir: 'V', isTarget: false },
      { id: 'C', row: 0, col: 3, length: 2, dir: 'H', isTarget: false },
      { id: 'D', row: 4, col: 4, length: 2, dir: 'H', isTarget: false },
    ],
  ];

  for (let i = 0; i < builtIn.length; i++) {
    const vehicles = builtIn[i];
    const inventory = vehicles.map((v) => ({
      id: v.id, length: v.length, dir: v.dir, isTarget: v.isTarget,
    }));
    const positions = vehicles.map((v) => [v.row, v.col]);

    // BFS forward from the puzzle, stopping when target reaches col >= GRID-2.
    const startKey = encode(positions);
    const dist = new Map([[startKey, 0]]);
    let frontier = [startKey];
    let depth = 0;
    let solvedDepth = -1;
    const targetIdx = inventory.findIndex((v) => v.isTarget);
    const winCol = GRID - inventory[targetIdx].length;

    outer: while (frontier.length && depth < 80) {
      const next = [];
      for (const k of frontier) {
        const pos = decode(k);
        if (pos[targetIdx][1] >= winCol) { solvedDepth = dist.get(k); break outer; }
        for (const m of neighbors(pos, inventory)) {
          const k2 = encode(m.positions);
          if (!dist.has(k2)) { dist.set(k2, depth + 1); next.push(k2); }
        }
      }
      frontier = next;
      depth++;
    }
    // If the loop finished without finding, scan dist for any winning state.
    if (solvedDepth === -1) {
      for (const [k, d] of dist) {
        const pos = decode(k);
        if (pos[targetIdx][1] >= winCol && (solvedDepth === -1 || d < solvedDepth)) {
          solvedDepth = d;
        }
      }
    }
    console.log(`Puzzle ${i}: minMoves = ${solvedDepth} (states explored: ${dist.size})`);
  }
}

// ─── CLI ───────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const out = {
    seeds: 30,
    vehicleCount: 11,
    perDifficulty: 30,
    output: path.join(__dirname, '..', 'src', '_data', 'rushHourPuzzles.json'),
    rngSeed: 1,
    maxDepth: 60,
    verify: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--seeds') out.seeds = parseInt(argv[++i], 10);
    else if (a === '--vehicle-count') out.vehicleCount = parseInt(argv[++i], 10);
    else if (a === '--per-difficulty') out.perDifficulty = parseInt(argv[++i], 10);
    else if (a === '--output') out.output = argv[++i];
    else if (a === '--rng-seed') out.rngSeed = parseInt(argv[++i], 10);
    else if (a === '--max-depth') out.maxDepth = parseInt(argv[++i], 10);
    else if (a === '--verify') out.verify = true;
    else if (a === '-h' || a === '--help') { printHelp(); process.exit(0); }
    else { console.error(`Unknown arg: ${a}`); printHelp(); process.exit(1); }
  }
  return out;
}

function printHelp() {
  console.error(`Usage: node tools/rush-hour-generator.js [options]

  --seeds N            number of random seeds to BFS (default 30)
  --vehicle-count N    non-target vehicles per seed (default 11)
  --per-difficulty N   keep top-N per difficulty bucket (default 30)
  --output PATH        output JSON path
  --rng-seed N         deterministic RNG seed (default 1)
  --max-depth N        BFS depth cap (default 60)
  --verify             BFS the three built-in puzzles and print minMoves
`);
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.verify) {
    verifyBuiltInPuzzles();
    return;
  }
  const result = generate(opts);
  fs.mkdirSync(path.dirname(opts.output), { recursive: true });
  fs.writeFileSync(opts.output, JSON.stringify(result, null, 2));
  console.error(`\nWrote ${opts.output}`);
  for (const k of Object.keys(result)) {
    console.error(`  ${k}: ${result[k].length} puzzles`);
  }
}

main();
