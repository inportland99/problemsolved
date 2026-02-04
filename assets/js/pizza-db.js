import { supabase, getCurrentUser } from './supabase-client.js';

/**
 * Save a pizza log to the database
 * @param {string} flourType - Type of flour used
 * @param {number} doughBalls - Number of dough balls
 * @param {number} ballSize - Size of each dough ball in grams
 * @param {number} hydration - Hydration percentage
 * @returns {Object} { success: boolean, data: object, error: object }
 */
export async function savePizzaLog(flourType, doughBalls, ballSize, hydration) {
  try {
    // Get current user
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: { message: 'You must be logged in to save pizza logs' } };
    }

    // Insert the log
    const { data, error } = await supabase
      .from('pizza_logs')
      .insert([
        {
          user_id: user.id,
          flour_type: flourType,
          dough_balls: doughBalls,
          ball_size: ballSize,
          hydration: hydration
        }
      ])
      .select();

    if (error) {
      console.error('Error saving pizza log:', error);
      return { success: false, error };
    }

    return { success: true, data: data[0] };
  } catch (err) {
    console.error('Unexpected error saving pizza log:', err);
    return { success: false, error: { message: err.message } };
  }
}

/**
 * Get all pizza logs for the current user
 * @returns {Object} { success: boolean, data: array, error: object }
 */
export async function getUserPizzaLogs() {
  try {
    // Get current user
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: { message: 'You must be logged in to view pizza logs' } };
    }

    // Fetch logs
    const { data, error } = await supabase
      .from('pizza_logs')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching pizza logs:', error);
      return { success: false, error };
    }

    return { success: true, data };
  } catch (err) {
    console.error('Unexpected error fetching pizza logs:', err);
    return { success: false, error: { message: err.message } };
  }
}

/**
 * Update a pizza log
 * @param {string} logId - The ID of the log to update
 * @param {Object} updates - The fields to update
 * @returns {Object} { success: boolean, data: object, error: object }
 */
export async function updatePizzaLog(logId, updates) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: { message: 'You must be logged in' } };
    }

    const { data, error } = await supabase
      .from('pizza_logs')
      .update(updates)
      .eq('id', logId)
      .eq('user_id', user.id)
      .select();

    if (error) {
      console.error('Error updating pizza log:', error);
      return { success: false, error };
    }

    return { success: true, data: data[0] };
  } catch (err) {
    console.error('Unexpected error updating pizza log:', err);
    return { success: false, error: { message: err.message } };
  }
}

/**
 * Delete a pizza log
 * @param {string} logId - The ID of the log to delete
 * @returns {Object} { success: boolean, error: object }
 */
export async function deletePizzaLog(logId) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: { message: 'You must be logged in' } };
    }

    const { error } = await supabase
      .from('pizza_logs')
      .delete()
      .eq('id', logId)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error deleting pizza log:', error);
      return { success: false, error };
    }

    return { success: true };
  } catch (err) {
    console.error('Unexpected error deleting pizza log:', err);
    return { success: false, error: { message: err.message } };
  }
}

/**
 * Upload a pizza image to Supabase Storage
 * @param {File} file - The image file to upload
 * @param {string} recipeId - The ID of the recipe (used for naming)
 * @returns {Object} { success: boolean, url: string, error: object }
 */
export async function uploadPizzaImage(file, recipeId) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: { message: 'You must be logged in' } };
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      return { success: false, error: { message: 'File must be an image' } };
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      return { success: false, error: { message: 'Image must be less than 5MB' } };
    }

    // Create a unique filename
    const fileExt = file.name.split('.').pop();
    const fileName = `${user.id}/${recipeId}-${Date.now()}.${fileExt}`;

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from('pizza-images')
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: false
      });

    if (error) {
      console.error('Error uploading image:', error);
      return { success: false, error };
    }

    // Get the public URL for the uploaded image
    const { data: urlData } = supabase.storage
      .from('pizza-images')
      .getPublicUrl(data.path);

    return { success: true, url: urlData.publicUrl };
  } catch (err) {
    console.error('Unexpected error uploading image:', err);
    return { success: false, error: { message: err.message } };
  }
}
