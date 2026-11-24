import dictionary from '../../../src/assets/data/boggle/scowl-35.json' with { type: 'json' };
import { buildTrie, solveBoard, hardestWords } from '../../../src/assets/js/vestaboard-boggle/game.mjs';

let trie;

export function finishWordsForBoard(board) {
  // Bundled data, not a network dependency on the site at the finishing tick.
  trie ??= buildTrie(dictionary.words);
  return hardestWords(solveBoard(board, trie).map(result => result.word));
}
