import { supabase, getCurrentUser } from './lessons-supabase-client.js';
import { flattenLessonMathTopics, setLessonMathTopics } from './taxonomy-db.js';

// Nested select fragment pulling each lesson's tagged Math Topics
// (Grade/Course + Domain + Math Topic, via the taxonomy table) along
// with whether each is the lesson's primary topic.
const MATH_CONTENT_SELECT = `lesson_math_topics(
  is_primary,
  taxonomy:taxonomy_id (
    id,
    grade_course:grades_courses(name),
    domain:domains(name),
    math_topic:math_topics(name)
  )
)`;

function withMathContent(lesson) {
  if (!lesson) return lesson;
  const { lesson_math_topics, ...rest } = lesson;
  return { ...rest, mathContent: flattenLessonMathTopics(lesson_math_topics) };
}

/**
 * Get all math lessons (public, no auth required for now)
 * @returns {Object} { success: boolean, data: array, error: object }
 */
export async function getAllLessons() {
  try {
    const { data, error } = await supabase
      .from('math_lessons')
      .select(`*, districts(name), ${MATH_CONTENT_SELECT}`)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching lessons:', error);
      return { success: false, error };
    }

    return { success: true, data: (data || []).map(withMathContent) };
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
      .select(`*, ${MATH_CONTENT_SELECT}`)
      .eq('id', lessonId)
      .single();

    if (error) {
      console.error('Error fetching lesson:', error);
      return { success: false, error };
    }

    return { success: true, data: withMathContent(data) };
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
    const user = await getCurrentUser();

    const { data, error } = await supabase
      .from('math_lessons')
      .insert([{
        title: lesson.title,
        lesson_content_name: lesson.lessonContentName || null,
        learning_goal: lesson.learningGoal,
        task: lesson.task,
        diagram_url: lesson.diagramUrl || null,
        launch_details: lesson.launchDetails || null,
        anticipated_strategies: lesson.anticipatedStrategies || [],
        questions: lesson.questions || [],
        author: lesson.author,
        district_id: lesson.districtId || null,
        created_by: user?.id || null
      }])
      .select();

    if (error) {
      console.error('Error creating lesson:', error);
      return { success: false, error };
    }

    const newLesson = data[0];

    if (lesson.mathContentSelection) {
      const tagResult = await setLessonMathTopics(newLesson.id, lesson.mathContentSelection);
      if (!tagResult.success) {
        console.error('Error saving Math Content tags for new lesson:', tagResult.error);
        return {
          success: false,
          data: newLesson,
          error: { message: 'Lesson was created, but Math Content tags failed to save. Edit the lesson to try again.' }
        };
      }
    }

    return { success: true, data: newLesson };
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
    
    if (updates.title !== undefined) updateData.title = updates.title;
    if (updates.lessonContentName !== undefined) updateData.lesson_content_name = updates.lessonContentName;
    if (updates.learningGoal !== undefined) updateData.learning_goal = updates.learningGoal;
    if (updates.task !== undefined) updateData.task = updates.task;
    if (updates.diagramUrl !== undefined) updateData.diagram_url = updates.diagramUrl;
    if (updates.launchDetails !== undefined) updateData.launch_details = updates.launchDetails;
    if (updates.anticipatedStrategies !== undefined) updateData.anticipated_strategies = updates.anticipatedStrategies;
    if (updates.questions !== undefined) updateData.questions = updates.questions;
    if (updates.author !== undefined) updateData.author = updates.author;
    if (updates.districtId !== undefined) updateData.district_id = updates.districtId;

    const { data, error } = await supabase
      .from('math_lessons')
      .update(updateData)
      .eq('id', lessonId)
      .select();

    if (error) {
      console.error('Error updating lesson:', error);
      return { success: false, error };
    }

    // RLS silently matches zero rows (rather than erroring) when the
    // current user isn't allowed to update this row -- e.g. a non-admin
    // editing a lesson outside their own district. Treat that as a failure
    // instead of reporting false success.
    if (!data || data.length === 0) {
      const message = 'No lesson was updated. You may not have permission to edit this lesson (e.g. it belongs to a different district).';
      console.error('Error updating lesson:', message);
      return { success: false, error: { message } };
    }

    if (updates.mathContentSelection !== undefined) {
      const tagResult = await setLessonMathTopics(lessonId, updates.mathContentSelection);
      if (!tagResult.success) {
        console.error('Error saving Math Content tags:', tagResult.error);
        return {
          success: false,
          data: data[0],
          error: { message: 'Lesson was updated, but Math Content tags failed to save. Try saving again.' }
        };
      }
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
