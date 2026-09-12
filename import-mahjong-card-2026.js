/**
 * Import the 2026 NMJL card into the Mah Jongg reference.
 *
 * Usage: open /personal/mahjong/ while logged in, open the browser console,
 * paste this whole file, and press Enter. It replaces any existing 2026 hands.
 *
 * Notation: each block is `TEXT.GROUP` where GROUP is the printed ink color —
 *   0 = black   (neutral tiles, and the card's third suit)
 *   1 = green
 *   2 = red
 * Lines printed with two alternatives use the second slot for the "-or-" version.
 */

(async () => {
  const { bulkCreateHands, deleteCardYear } = await import('/assets/js/mahjong-db.js');

  // 'FF.0 2222.1 4444.2' -> [{ text: 'FF', group: 0 }, ...]
  const p = (s) => s.trim().split(/\s+/).filter(Boolean).map((token) => {
    const i = token.lastIndexOf('.');
    return { text: token.slice(0, i), group: Number(token.slice(i + 1)) };
  });

  // [category, categoryOrder, [ [pattern, alt|null, value, concealed, note], ... ]]
  const CARD = [
    ['2026', 0, [
      ['222.1 000.0 2222.1 6666.2', null, 25, false, 'Any 2 Suits'],
      ['2026.1 DDD.1 2222.2 DDD.2', null, 25, false, 'Any 2 Suits w Matching Dragons, Kong 2 or 6'],
      ['FFF.0 2026.1 222.2 6666.0', null, 25, false, 'Any 3 Suits'],
      ['22.1 00.1 222.2 666.2 NEWS.0', null, 30, false, 'Any 2 Suits'],
    ]],

    ['2468', 1, [
      ['222.0 444.0 6666.0 8888.0', '222.0 444.1 6666.2 8888.2', 25, false, 'Any 1 or 2 Suits'],
      ['FF.0 2222.1 44.2 66.2 8888.1', null, 30, false, 'Any 2 Suits'],
      ['EE.0 22.0 444.0 666.0 88.0 WW.0', null, 30, false, 'Any 1 Suit, East and West Only'],
      ['2222.1 DDD.1 8888.2 DDD.2', null, 25, false, 'Any 2 Suits w Matching Dragons, These Nos. Only'],
      ['FFF.0 22.0 44.0 666.0 8888.0', null, 25, false, 'Any 1 Suit'],
      ['2468.1 2222.2 D.2 2222.0 D.0', null, 25, false, 'Any 3 Suits, Like kongs 2,4,6 or 8 w Matching Dragon'],
      ['FFF.0 2468.1 FFF.0 2222.2', null, 30, false, 'Any 2 Suits, kong 2,4,6 or 8'],
      ['FF.0 246.1 888.1 246.2 888.2', null, 30, true, 'Any 2 Suits'],
    ]],

    ['ANY LIKE NUMBERS', 2, [
      ['1111.1 FFFFFF.0 1111.2', null, 30, false, 'Any 2 Suits'],
      ['1111.1 D.1 111.2 D.2 1111.0 D.0', null, 25, false, 'Any 3 Suits w Matching Dragon'],
      ['FF.0 1111.1 11.2 1111.0 DD.1', null, 25, false, 'Any 3 Suits w Any Dragon'],
    ]],

    ['QUINTS', 3, [
      ['11111.1 1111.2 11111.0', null, 40, false, 'Any 3 Suits, Any Like Nos.'],
      ['FF.0 11111.0 22.0 33333.0', null, 45, false, 'Any 1 Suit, Any 3 Consec. Nos.'],
      ['11111.1 44444.1 DDDD.2', null, 40, false, 'Any 2 Nos. in Any 1 Suit w Opp. Dragon'],
    ]],

    ['CONSECUTIVE RUN', 4, [
      ['11.0 222.0 33.0 444.0 5555.0', '55.0 666.0 77.0 888.0 9999.0', 25, false, 'Any 1 Suit, These Nos. Only'],
      ['FFF.0 1111.0 234.0 5555.0', 'FFF.0 1111.1 234.2 5555.1', 25, false, 'Any 1 or 2 Suits, Any 5 Consec. Nos.'],
      ['11.1 22.1 111.2 222.2 3333.0', null, 25, false, 'Any 3 Suits, Any 3 Consec. Nos.'],
      ['111.0 222.0 3333.0 4444.0', '111.1 222.1 3333.2 4444.2', 25, false, 'Any 1 or 2 Suits, Any 4 Consec. Nos.'],
      ['FFF.0 11.0 22.0 333.0 DDDD.0', 'FFF.0 11.1 22.2 333.0 DDDD.2', 25, false, '1 or 2 Suits, Any Run, Ds Match Middle No.'],
      ['1111.0 FFFFFF.0 2222.0', null, 30, false, 'Any 1 Suit, Any 2 Consec. Nos.'],
      ['FF.0 1111.0 2222.0 3333.0', 'FF.0 1111.1 2222.2 3333.0', 25, false, 'Any 1 or 3 Suits, Any 3 Consec. Nos.'],
      ['1.1 22.1 333.1 1.2 22.2 333.2 44.0', null, 35, true, 'Any 3 Suits, Any 4 Consec. Nos.'],
    ]],

    ['13579', 5, [
      ['11.0 333.0 55.0 777.0 9999.0', '11.0 333.1 55.2 777.2 9999.0', 25, false, 'Any 1 or 3 Suits'],
      ['111.1 333.1 3333.2 5555.2', '555.1 777.1 7777.2 9999.2', 25, false, 'Any 2 Suits'],
      ['NN.0 1111.0 33.0 5555.0 SS.0', 'NN.0 5555.0 77.0 9999.0 SS.0', 30, false, 'Any 1 Suit, North and South Only'],
      ['11.1 3579.0 1111.2 1111.0', null, 25, false, 'Any 3 Suits, Pair Any Odd No., Kongs Match Pair'],
      ['FFF.0 11.0 33.0 555.0 DDDD.0', 'FFF.0 55.0 77.0 999.0 DDDD.0', 25, false, 'Any 1 Suit w Matching Dragon'],
      ['11.1 33.1 111.2 333.2 5555.0', '55.1 77.1 555.2 777.2 9999.0', 25, false, 'Any 3 Suits'],
      ['1111.0 33.0 55.0 77.0 9999.0', '1111.2 33.2 55.2 77.2 9999.1', 30, false, 'Any 1 or 2 Suits'],
      ['FF.0 11.1 33.1 55.1 111.2 111.0', 'FF.0 55.1 77.1 99.1 555.2 555.0', 35, true, 'Any 3 Suits, These Nos. Only'],
      ['FF.0 135.1 777.1 999.1 DDD.2', null, 30, true, 'Any 1 Suit w Opp. Dragon'],
    ]],

    ['WINDS-DRAGONS', 6, [
      // VERIFY: photo was ambiguous here; this is the only 14-tile reading that
      // complements the printed alternate (4-3-3-4 vs 3-4-4-3).
      ['NNNN.0 EEE.0 WWW.0 SSSS.0', 'NNN.0 EEEE.0 WWWW.0 SSS.0', 25, false, null],
      ['1234.0 DDD.1 DDD.2 DDDD.0', null, 25, false, 'Any 4 Consec. Nos. in Any 1 Suit. Any 3 Dragons'],
      ['NNN.0 1111.1 1111.2 SSS.0', null, 25, false, 'Any Like Odd Nos. in Any 2 Suits'],
      ['EEE.0 2222.1 2222.2 WWW.0', null, 25, false, 'Any Like Even Nos. in Any 2 Suits'],
      ['FFF.0 NNNN.0 FFF.0 DDDD.0', null, 25, false, 'Any Wind, Any Dragon'],
      ['1.0 N.0 2.0 EE.0 3.0 WWW.0 4.0 SSSS.0', null, 25, false, 'Any 1 Suit, These Nos. Only'],
      ['FF.0 NNNN.0 SSSS.0 DD.1 DD.2', 'FF.0 EEEE.0 WWWW.0 DD.1 DD.2', 25, false, 'Any 2 Dragons'],
      ['NN.0 EEE.0 2026.0 WWW.0 SS.0', null, 30, true, '2026 Any 1 Suit'],
    ]],

    ['369', 7, [
      ['333.1 666.1 6666.2 9999.2', '333.1 666.1 6666.2 9999.0', 25, false, 'Any 2 or 3 Suits'],
      ['33.1 66.1 333.2 666.2 9999.0', null, 25, false, 'Any 3 Suits'],
      ['FFF.0 33.0 666.0 99.0 DDDD.0', 'FFF.0 33.1 666.1 99.1 DDDD.2', 25, false, '1 Suit w Matching or Opp. Dragon'],
      ['33.1 66.1 666.2 999.2 NEWS.0', null, 30, false, 'Any 2 Suits'],
      ['FF.0 3369.1 3333.2 3333.0', null, 25, false, 'Any 3 Suits, Pair 3, 6, or 9, Kongs Match Pair'],
      ['FF.0 333.1 666.1 999.2 369.2', null, 30, true, 'Any 2 Suits'],
    ]],

    ['SINGLES AND PAIRS', 8, [
      ['NN.0 EE.0 WW.0 SS.0 1D.1 1D.2 1D.0', null, 50, true, 'Any 3 Suits, Any Like No. w Matching Dragon'],
      ['2.1 4.1 66.1 88.1 2.2 4.2 66.2 88.2 88.0', null, 50, true, 'Any 3 Suits, These Nos. Only'],
      ['FF.0 3369.1 3669.2 3699.0', null, 50, true, 'Any 3 Suits'],
      ['11.0 22.0 33.0 44.0 55.0 66.0 77.0', null, 50, true, 'Any 1 Suit, Any 7 Consec. Nos.'],
      ['11.1 357.1 99.1 11.2 357.2 99.2', null, 50, true, 'Any 2 Suits'],
      ['FF.1 2026.1 2026.2 2026.0', null, 75, true, 'Any 3 Suits'],
    ]],
  ];

  const hands = [];
  for (const [category, categoryOrder, rows] of CARD) {
    rows.forEach(([pattern, alt, value, concealed, note], i) => {
      hands.push({
        card_year: 2026,
        category,
        category_order: categoryOrder,
        sort_order: i,
        pattern_blocks: p(pattern),
        alt_pattern_blocks: alt ? p(alt) : null,
        value,
        concealed,
        notes: note,
      });
    });
  }

  if (!confirm(`Replace all 2026 hands with ${hands.length} freshly imported hands?`)) {
    console.log('Import cancelled.');
    return;
  }

  const cleared = await deleteCardYear(2026);
  if (!cleared.success) {
    console.error('Could not clear existing 2026 hands:', cleared.error);
    return;
  }

  const result = await bulkCreateHands(hands);
  if (!result.success) {
    console.error('Import failed:', result.error);
    return;
  }

  console.log(`Imported ${result.data.length} hands.`);
  window.location.reload();
})();
