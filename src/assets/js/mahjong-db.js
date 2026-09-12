import { supabase, getCurrentUser } from './supabase-client.js';

// ─── Pattern helpers ────────────────────────────────────────────────────────

/**
 * A hand pattern is stored as an ordered array of blocks:
 *   [{ text: 'FF', group: 0 }, { text: '2222', group: 1 }]
 *
 * The card prints in three ink colors:
 *   group 0 = black — neutral tiles (flowers, winds, dragons) AND the third suit
 *   group 1 = green
 *   group 2 = red
 *
 * Many card lines print two ways to build the same hand, joined by '-or-'.
 * Those are stored on one row: the first in `pattern_blocks`, the second in
 * `alt_pattern_blocks`.
 */
export const GROUP_COUNT = 3;

/**
 * Split a typed pattern string into blocks, preserving existing group
 * assignments by position where possible.
 * @param {string} text - e.g. 'FF 2222 000 6666'
 * @param {Array} [previousBlocks] - existing blocks to inherit colors from
 * @returns {Array} array of { text, group }
 */
export function parsePatternBlocks(text, previousBlocks = []) {
  return String(text || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((chunk, i) => ({
      text: chunk,
      group: previousBlocks[i]?.group ?? 0,
    }));
}

/**
 * Flatten blocks back to the plain-text pattern used for search.
 * @param {Array} blocks
 * @returns {string}
 */
export function blocksToText(blocks) {
  return (blocks || []).map((b) => b.text).join(' ');
}

/**
 * Build the denormalized search text for a hand, covering both patterns.
 * @param {Array} blocks
 * @param {Array} [altBlocks]
 * @returns {string}
 */
function searchTextFor(blocks, altBlocks) {
  const main = blocksToText(blocks);
  const alt = altBlocks && altBlocks.length ? blocksToText(altBlocks) : '';
  return alt ? `${main} -or- ${alt}` : main;
}

// ─── Hands ──────────────────────────────────────────────────────────────────

/**
 * Get all hands for the current user, optionally filtered to one card year.
 * @param {number} [cardYear]
 * @returns {Object} { success: boolean, data: array, error: object }
 */
export async function getHands(cardYear) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: { message: 'You must be logged in to view hands' } };
    }

    let query = supabase
      .from('mahjong_hands')
      .select('*')
      .eq('user_id', user.id)
      .order('category_order', { ascending: true })
      .order('sort_order', { ascending: true });

    if (cardYear) {
      query = query.eq('card_year', cardYear);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching mahjong hands:', error);
      return { success: false, error };
    }

    return { success: true, data };
  } catch (err) {
    console.error('Unexpected error fetching mahjong hands:', err);
    return { success: false, error: { message: err.message } };
  }
}

/**
 * Get the distinct card years the current user has transcribed.
 * @returns {Object} { success: boolean, data: number[], error: object }
 */
export async function getCardYears() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: { message: 'You must be logged in' } };
    }

    const { data, error } = await supabase
      .from('mahjong_hands')
      .select('card_year')
      .eq('user_id', user.id);

    if (error) {
      console.error('Error fetching card years:', error);
      return { success: false, error };
    }

    const years = [...new Set((data || []).map((r) => r.card_year))].sort((a, b) => b - a);
    return { success: true, data: years };
  } catch (err) {
    console.error('Unexpected error fetching card years:', err);
    return { success: false, error: { message: err.message } };
  }
}

/**
 * Create a hand.
 * @param {Object} hand - { card_year, category, category_note, category_order,
 *                          sort_order, pattern_blocks, value, concealed, notes }
 * @returns {Object} { success: boolean, data: object, error: object }
 */
export async function createHand(hand) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: { message: 'You must be logged in to add a hand' } };
    }

    const payload = {
      ...hand,
      pattern_text: searchTextFor(hand.pattern_blocks, hand.alt_pattern_blocks),
      user_id: user.id,
    };

    const { data, error } = await supabase
      .from('mahjong_hands')
      .insert([payload])
      .select();

    if (error) {
      console.error('Error creating mahjong hand:', error);
      return { success: false, error };
    }

    return { success: true, data: data[0] };
  } catch (err) {
    console.error('Unexpected error creating mahjong hand:', err);
    return { success: false, error: { message: err.message } };
  }
}

/**
 * Update a hand.
 * @param {string} handId
 * @param {Object} updates
 * @returns {Object} { success: boolean, data: object, error: object }
 */
export async function updateHand(handId, updates) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: { message: 'You must be logged in' } };
    }

    const payload = { ...updates };
    if (updates.pattern_blocks) {
      payload.pattern_text = searchTextFor(updates.pattern_blocks, updates.alt_pattern_blocks);
    }

    const { data, error } = await supabase
      .from('mahjong_hands')
      .update(payload)
      .eq('id', handId)
      .eq('user_id', user.id)
      .select();

    if (error) {
      console.error('Error updating mahjong hand:', error);
      return { success: false, error };
    }

    return { success: true, data: data[0] };
  } catch (err) {
    console.error('Unexpected error updating mahjong hand:', err);
    return { success: false, error: { message: err.message } };
  }
}

/**
 * Delete a hand.
 * @param {string} handId
 * @returns {Object} { success: boolean, error: object }
 */
export async function deleteHand(handId) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: { message: 'You must be logged in' } };
    }

    const { error } = await supabase
      .from('mahjong_hands')
      .delete()
      .eq('id', handId)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error deleting mahjong hand:', error);
      return { success: false, error };
    }

    return { success: true };
  } catch (err) {
    console.error('Unexpected error deleting mahjong hand:', err);
    return { success: false, error: { message: err.message } };
  }
}

/**
 * Insert many hands at once — used when transcribing a full card.
 * @param {Array} hands
 * @returns {Object} { success: boolean, data: array, error: object }
 */
export async function bulkCreateHands(hands) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: { message: 'You must be logged in' } };
    }

    const payload = (hands || []).map((hand) => ({
      ...hand,
      pattern_text: searchTextFor(hand.pattern_blocks, hand.alt_pattern_blocks),
      user_id: user.id,
    }));

    const { data, error } = await supabase
      .from('mahjong_hands')
      .insert(payload)
      .select();

    if (error) {
      console.error('Error bulk-creating mahjong hands:', error);
      return { success: false, error };
    }

    return { success: true, data };
  } catch (err) {
    console.error('Unexpected error bulk-creating mahjong hands:', err);
    return { success: false, error: { message: err.message } };
  }
}

/**
 * Delete every hand for a given card year — used to re-import a card cleanly.
 * @param {number} cardYear
 * @returns {Object} { success: boolean, error: object }
 */
export async function deleteCardYear(cardYear) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: { message: 'You must be logged in' } };
    }

    const { error } = await supabase
      .from('mahjong_hands')
      .delete()
      .eq('card_year', cardYear)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error deleting card year:', error);
      return { success: false, error };
    }

    return { success: true };
  } catch (err) {
    console.error('Unexpected error deleting card year:', err);
    return { success: false, error: { message: err.message } };
  }
}
