import { supabase, getCurrentUser } from './supabase-client.js';

// ─── Items ──────────────────────────────────────────────────────────────────

/**
 * Get all Vestaboard items for the current user.
 * @returns {Object} { success: boolean, data: array, error: object }
 */
export async function getItems() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: { message: 'You must be logged in to view items' } };
    }

    const { data, error } = await supabase
      .from('vestaboard_items')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching vestaboard items:', error);
      return { success: false, error };
    }

    return { success: true, data };
  } catch (err) {
    console.error('Unexpected error fetching vestaboard items:', err);
    return { success: false, error: { message: err.message } };
  }
}

/**
 * Create a new Vestaboard item.
 * @param {Object} item - { name, mode, text_content, grid_content }
 * @returns {Object} { success: boolean, data: object, error: object }
 */
export async function createItem(item) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: { message: 'You must be logged in to create an item' } };
    }

    const { data, error } = await supabase
      .from('vestaboard_items')
      .insert([{ ...item, user_id: user.id }])
      .select();

    if (error) {
      console.error('Error creating vestaboard item:', error);
      return { success: false, error };
    }

    return { success: true, data: data[0] };
  } catch (err) {
    console.error('Unexpected error creating vestaboard item:', err);
    return { success: false, error: { message: err.message } };
  }
}

/**
 * Update an existing Vestaboard item.
 * @param {string} itemId
 * @param {Object} updates
 * @returns {Object} { success: boolean, data: object, error: object }
 */
export async function updateItem(itemId, updates) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: { message: 'You must be logged in' } };
    }

    const { data, error } = await supabase
      .from('vestaboard_items')
      .update(updates)
      .eq('id', itemId)
      .eq('user_id', user.id)
      .select();

    if (error) {
      console.error('Error updating vestaboard item:', error);
      return { success: false, error };
    }

    return { success: true, data: data[0] };
  } catch (err) {
    console.error('Unexpected error updating vestaboard item:', err);
    return { success: false, error: { message: err.message } };
  }
}

/**
 * Delete a Vestaboard item (and any schedules referencing it, via cascade).
 * @param {string} itemId
 * @returns {Object} { success: boolean, error: object }
 */
export async function deleteItem(itemId) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: { message: 'You must be logged in' } };
    }

    const { error } = await supabase
      .from('vestaboard_items')
      .delete()
      .eq('id', itemId)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error deleting vestaboard item:', error);
      return { success: false, error };
    }

    return { success: true };
  } catch (err) {
    console.error('Unexpected error deleting vestaboard item:', err);
    return { success: false, error: { message: err.message } };
  }
}

/**
 * Duplicate an existing item (e.g. as a starting point for a variation).
 * @param {Object} item - the item to duplicate
 * @returns {Object} { success: boolean, data: object, error: object }
 */
export async function duplicateItem(item) {
  return createItem({
    name: `${item.name} (copy)`,
    mode: item.mode,
    text_content: item.text_content,
    grid_content: item.grid_content,
  });
}

// ─── Schedules ──────────────────────────────────────────────────────────────

/**
 * Get all schedules for the current user, optionally filtered to one item.
 * @param {string} [itemId]
 * @returns {Object} { success: boolean, data: array, error: object }
 */
export async function getSchedules(itemId) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: { message: 'You must be logged in to view schedules' } };
    }

    let query = supabase
      .from('vestaboard_schedules')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });

    if (itemId) {
      query = query.eq('item_id', itemId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching vestaboard schedules:', error);
      return { success: false, error };
    }

    return { success: true, data };
  } catch (err) {
    console.error('Unexpected error fetching vestaboard schedules:', err);
    return { success: false, error: { message: err.message } };
  }
}

/**
 * Create a schedule for an item.
 * @param {Object} schedule - { item_id, days_of_week, time_of_day, timezone, enabled }
 * @returns {Object} { success: boolean, data: object, error: object }
 */
export async function createSchedule(schedule) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: { message: 'You must be logged in to create a schedule' } };
    }

    const { data, error } = await supabase
      .from('vestaboard_schedules')
      .insert([{ ...schedule, user_id: user.id }])
      .select();

    if (error) {
      console.error('Error creating vestaboard schedule:', error);
      return { success: false, error };
    }

    return { success: true, data: data[0] };
  } catch (err) {
    console.error('Unexpected error creating vestaboard schedule:', err);
    return { success: false, error: { message: err.message } };
  }
}

/**
 * Update a schedule.
 * @param {string} scheduleId
 * @param {Object} updates
 * @returns {Object} { success: boolean, data: object, error: object }
 */
export async function updateSchedule(scheduleId, updates) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: { message: 'You must be logged in' } };
    }

    const { data, error } = await supabase
      .from('vestaboard_schedules')
      .update(updates)
      .eq('id', scheduleId)
      .eq('user_id', user.id)
      .select();

    if (error) {
      console.error('Error updating vestaboard schedule:', error);
      return { success: false, error };
    }

    return { success: true, data: data[0] };
  } catch (err) {
    console.error('Unexpected error updating vestaboard schedule:', err);
    return { success: false, error: { message: err.message } };
  }
}

/**
 * Delete a schedule.
 * @param {string} scheduleId
 * @returns {Object} { success: boolean, error: object }
 */
export async function deleteSchedule(scheduleId) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: { message: 'You must be logged in' } };
    }

    const { error } = await supabase
      .from('vestaboard_schedules')
      .delete()
      .eq('id', scheduleId)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error deleting vestaboard schedule:', error);
      return { success: false, error };
    }

    return { success: true };
  } catch (err) {
    console.error('Unexpected error deleting vestaboard schedule:', err);
    return { success: false, error: { message: err.message } };
  }
}

// ─── Sending ────────────────────────────────────────────────────────────────

/**
 * Immediately send an item to the Vestaboard via the vestaboard-send Edge Function.
 * @param {string} itemId
 * @returns {Object} { success: boolean, error: object }
 */
export async function sendItemNow(itemId) {
  try {
    const { data, error } = await supabase.functions.invoke('vestaboard-send', {
      body: { action: 'send-now', itemId },
    });

    if (error) {
      console.error('Error sending item to Vestaboard:', error);
      return { success: false, error };
    }

    if (data?.error) {
      return { success: false, error: { message: data.error } };
    }

    return { success: true };
  } catch (err) {
    console.error('Unexpected error sending item to Vestaboard:', err);
    return { success: false, error: { message: err.message } };
  }
}
