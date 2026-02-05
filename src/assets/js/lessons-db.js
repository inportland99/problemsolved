import { supabase } from './lessons-supabase-client.js';

/**
 * Get all math lessons (public, no auth required for now)
 * @returns {Object} { success: boolean, data: array, error: object }
 */
export async function getAllLessons() {
  try {
    const { data, error } = await supabase
      .from('math_lessons')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching lessons:', error);
      return { success: false, error };
    }

    return { success: true, data };
  } catch (err) {
    console.error('Unexpected error fetching lessons:', err);
    return { success: false, error: { message: err.message } };
  }
}

/**
 * Get a single lesson by ID
 * @param {string} lessonId - The ID of the lesson
 * @returns {Object} { success: boolean, data: object, error: object }
 */
export async function getLessonById(lessonId) {
  try {
    const { data, error } = await supabase
      .from('math_lessons')
      .select('*')
      .eq('id', lessonId)
      .single();

    if (error) {
      console.error('Error fetching lesson:', error);
      return { success: false, error };
    }

    return { success: true, data };
  } catch (err) {
    console.error('Unexpected error fetching lesson:', err);
    return { success: false, error: { message: err.message } };
  }
}

/**
 * Create a new math lesson
 * @param {Object} lesson - The lesson data
 * @returns {Object} { success: boolean, data: object, error: object }
 */
export async function createLesson(lesson) {
  try {
    const { data, error } = await supabase
      .from('math_lessons')
      .insert([{
        learning_goal: lesson.learningGoal,
        task: lesson.task,
        diagram_url: lesson.diagramUrl || null,
        launch_details: lesson.launchDetails || null,
        anticipated_strategies: lesson.anticipatedStrategies || [],
        connecting_questions: lesson.connectingQuestions || [],
        author: lesson.author
      }])
      .select();

    if (error) {
      console.error('Error creating lesson:', error);
      return { success: false, error };
    }

    return { success: true, data: data[0] };
  } catch (err) {
    console.error('Unexpected error creating lesson:', err);
    return { success: false, error: { message: err.message } };
  }
}

/**
 * Update an existing math lesson
 * @param {string} lessonId - The ID of the lesson to update
 * @param {Object} updates - The fields to update
 * @returns {Object} { success: boolean, data: object, error: object }
 */
export async function updateLesson(lessonId, updates) {
  try {
    const updateData = {};
    
    if (updates.learningGoal !== undefined) updateData.learning_goal = updates.learningGoal;
    if (updates.task !== undefined) updateData.task = updates.task;
    if (updates.diagramUrl !== undefined) updateData.diagram_url = updates.diagramUrl;
    if (updates.launchDetails !== undefined) updateData.launch_details = updates.launchDetails;
    if (updates.anticipatedStrategies !== undefined) updateData.anticipated_strategies = updates.anticipatedStrategies;
    if (updates.connectingQuestions !== undefined) updateData.connecting_questions = updates.connectingQuestions;
    if (updates.author !== undefined) updateData.author = updates.author;

    const { data, error } = await supabase
      .from('math_lessons')
      .update(updateData)
      .eq('id', lessonId)
      .select();

    if (error) {
      console.error('Error updating lesson:', error);
      return { success: false, error };
    }

    return { success: true, data: data[0] };
  } catch (err) {
    console.error('Unexpected error updating lesson:', err);
    return { success: false, error: { message: err.message } };
  }
}

/**
 * Delete a math lesson
 * @param {string} lessonId - The ID of the lesson to delete
 * @returns {Object} { success: boolean, error: object }
 */
export async function deleteLesson(lessonId) {
  try {
    const { error } = await supabase
      .from('math_lessons')
      .delete()
      .eq('id', lessonId);

    if (error) {
      console.error('Error deleting lesson:', error);
      return { success: false, error };
    }

    return { success: true };
  } catch (err) {
    console.error('Unexpected error deleting lesson:', err);
    return { success: false, error: { message: err.message } };
  }
}

/**
 * Upload a lesson diagram to Supabase Storage
 * @param {File} file - The image file to upload
 * @param {string} lessonId - The ID of the lesson (used for naming)
 * @returns {Object} { success: boolean, url: string, error: object }
 */
export async function uploadLessonImage(file, lessonId) {
  try {
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
    const fileName = `${lessonId}-${Date.now()}.${fileExt}`;

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from('lesson-images')
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
      .from('lesson-images')
      .getPublicUrl(data.path);

    return { success: true, url: urlData.publicUrl };
  } catch (err) {
    console.error('Unexpected error uploading image:', err);
    return { success: false, error: { message: err.message } };
  }
}
