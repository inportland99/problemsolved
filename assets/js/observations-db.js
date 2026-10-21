import { supabase, getCurrentUser } from './lessons-supabase-client.js';

// Nested select: single taxonomy tag + optional linked portal lesson.
const OBSERVATION_SELECT = `*,
  taxonomy:taxonomy_id (
    id,
    grade_course:grades_courses(name),
    domain:domains(name),
    math_topic:math_topics(name)
  ),
  math_lesson:math_lesson_id (
    id,
    title
  )`;

/**
 * Normalize nested taxonomy / lesson embeds into flat fields for templates.
 * @param {Object} obs
 * @returns {Object}
 */
export function withObservationTaxonomy(obs) {
  if (!obs) return obs;
  const { taxonomy, math_lesson, ...rest } = obs;
  const mathContent = taxonomy
    ? {
        taxonomyId: taxonomy.id,
        gradeCourse: taxonomy.grade_course?.name || null,
        domain: taxonomy.domain?.name || null,
        topic: taxonomy.math_topic?.name || null
      }
    : null;
  return {
    ...rest,
    taxonomy,
    math_lesson,
    mathContent,
    mathContentLabel: mathContent
      ? [mathContent.gradeCourse, mathContent.domain, mathContent.topic].filter(Boolean).join(' · ')
      : null,
    linkedLessonTitle: math_lesson?.title || null
  };
}

/**
 * Create a new observation
 * @param {Object} obs - The observation data
 * @returns {Object} { success: boolean, data: object, error: object }
 */
export async function createObservation(obs) {
  try {
    const user = await getCurrentUser();

    const { data, error } = await supabase
      .from('observations')
      .insert([{
        teacher_name: obs.teacherName,
        observed_teacher_id: obs.observedTeacherId || null,
        // Kept for older rows; new UI prefers taxonomy_id (may denormalize grade label).
        grade_course: obs.gradeCourse || null,
        lesson: obs.lesson,
        observation_date: obs.observationDate,
        observer_name: obs.observerName,
        planning_score: obs.planningScore,
        planning_notes: obs.planningNotes,
        launch_score: obs.launchScore,
        launch_notes: obs.launchNotes,
        problem_solving_score: obs.problemSolvingScore,
        problem_solving_notes: obs.problemSolvingNotes,
        closing_score: obs.closingScore,
        closing_notes: obs.closingNotes,
        additional_notes: obs.additionalNotes,
        math_lesson_id: obs.mathLessonId || null,
        taxonomy_id: obs.taxonomyId || null,
        created_by: user?.id || null
      }])
      .select(OBSERVATION_SELECT);

    if (error) {
      console.error('Error creating observation:', error);
      return { success: false, error };
    }

    return { success: true, data: withObservationTaxonomy(data[0]) };
  } catch (err) {
    console.error('Unexpected error creating observation:', err);
    return { success: false, error: { message: err.message } };
  }
}

/**
 * Get all observations, ordered by date descending
 * @returns {Object} { success: boolean, data: array, error: object }
 */
export async function getAllObservations() {
  try {
    const { data, error } = await supabase
      .from('observations')
      .select(OBSERVATION_SELECT)
      .order('observation_date', { ascending: false });

    if (error) {
      console.error('Error fetching observations:', error);
      return { success: false, error };
    }

    return { success: true, data: (data || []).map(withObservationTaxonomy) };
  } catch (err) {
    console.error('Unexpected error fetching observations:', err);
    return { success: false, error: { message: err.message } };
  }
}

/**
 * Update an existing observation
 * @param {string} id - The observation ID
 * @param {Object} obs - The updated observation data
 * @returns {Object} { success: boolean, data: object, error: object }
 */
export async function updateObservation(id, obs) {
  try {
    const { data, error } = await supabase
      .from('observations')
      .update({
        teacher_name: obs.teacherName,
        observed_teacher_id: obs.observedTeacherId || null,
        grade_course: obs.gradeCourse || null,
        lesson: obs.lesson,
        observation_date: obs.observationDate,
        observer_name: obs.observerName,
        planning_score: obs.planningScore,
        planning_notes: obs.planningNotes,
        launch_score: obs.launchScore,
        launch_notes: obs.launchNotes,
        problem_solving_score: obs.problemSolvingScore,
        problem_solving_notes: obs.problemSolvingNotes,
        closing_score: obs.closingScore,
        closing_notes: obs.closingNotes,
        additional_notes: obs.additionalNotes,
        math_lesson_id: obs.mathLessonId || null,
        taxonomy_id: obs.taxonomyId || null
      })
      .eq('id', id)
      .select(OBSERVATION_SELECT);

    if (error) {
      console.error('Error updating observation:', error);
      return { success: false, error };
    }

    return { success: true, data: withObservationTaxonomy(data[0]) };
  } catch (err) {
    console.error('Unexpected error updating observation:', err);
    return { success: false, error: { message: err.message } };
  }
}

/**
 * Delete an observation by ID
 * @param {string} id - The observation ID
 * @returns {Object} { success: boolean, error: object }
 */
export async function deleteObservation(id) {
  try {
    const { error } = await supabase
      .from('observations')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting observation:', error);
      return { success: false, error };
    }

    return { success: true };
  } catch (err) {
    console.error('Unexpected error deleting observation:', err);
    return { success: false, error: { message: err.message } };
  }
}

/**
 * Get a single observation by ID
 * @param {string} id - The observation ID
 * @returns {Object} { success: boolean, data: object, error: object }
 */
export async function getObservationById(id) {
  try {
    const { data, error } = await supabase
      .from('observations')
      .select(OBSERVATION_SELECT)
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching observation:', error);
      return { success: false, error };
    }

    return { success: true, data: withObservationTaxonomy(data) };
  } catch (err) {
    console.error('Unexpected error fetching observation:', err);
    return { success: false, error: { message: err.message } };
  }
}
