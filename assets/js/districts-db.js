import { supabase } from './lessons-supabase-client.js';

/**
 * Get all school districts, ordered by name.
 * @returns {Object} { success: boolean, data: array, error: object }
 */
export async function getAllDistricts() {
  try {
    const { data, error } = await supabase
      .from('districts')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      console.error('Error fetching districts:', error);
      return { success: false, error };
    }

    return { success: true, data };
  } catch (err) {
    console.error('Unexpected error fetching districts:', err);
    return { success: false, error: { message: err.message } };
  }
}
