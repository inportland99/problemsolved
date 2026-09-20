/**
 * Backfill search_patterns for existing Mah Jongg hands.
 *
 * Search now matches only against hand.search_patterns, so any hand saved
 * before that field existed (or never manually edited since) has none and
 * will not show up in search results. This copies each such hand's main +
 * alt display pattern into search_patterns as plain text (no group info).
 *
 * Usage: open /personal/mahjong/ while logged in as the owner, open the
 * browser console, paste this whole file, and press Enter.
 *
 * Safe to re-run: hands that already have search_patterns are left alone,
 * so any hand-curated multi-option entries (e.g. Consecutive Run, Any Like
 * Numbers) are never overwritten.
 */

(async () => {
  const { getHands, updateHand } = await import('/assets/js/mahjong-db.js');

  const toRows = (blocks, altBlocks) => {
    const rows = [(blocks || []).map((b) => b.text)];
    if (altBlocks?.length) {
      rows.push(altBlocks.map((b) => b.text));
    }
    return rows;
  };

  const result = await getHands(); // no year filter — every hand
  if (!result.success) {
    console.error('Could not load hands:', result.error);
    return;
  }

  const needsBackfill = result.data.filter((h) => !h.search_patterns || h.search_patterns.length === 0);

  if (needsBackfill.length === 0) {
    console.log('Nothing to do — every hand already has search_patterns.');
    return;
  }

  if (!confirm(`Backfill search_patterns for ${needsBackfill.length} hand(s) from their display patterns?`)) {
    console.log('Backfill cancelled.');
    return;
  }

  let succeeded = 0;
  const failures = [];

  for (const hand of needsBackfill) {
    const search_patterns = toRows(hand.pattern_blocks, hand.alt_pattern_blocks);
    const updated = await updateHand(hand.id, { search_patterns });

    if (updated.success) {
      succeeded += 1;
    } else {
      failures.push({ id: hand.id, category: hand.category, error: updated.error });
    }
  }

  console.log(`Backfilled ${succeeded}/${needsBackfill.length} hand(s).`);
  if (failures.length) {
    console.error('Failed:', failures);
  } else {
    window.location.reload();
  }
})();
