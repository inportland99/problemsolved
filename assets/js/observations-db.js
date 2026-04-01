import { supabase, getCurrentUser } from './lessons-supabase-client.js';

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
        grade_course: obs.gradeCourse,
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
        created_by: user?.id || null
      }])
      .select();

    if (error) {
      console.error('Error creating observation:', error);
      return { success: false, error };
    }

    return { success: true, data: data[0] };
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
      .select('*')
      .order('observation_date', { ascending: false });

    if (error) {
      console.error('Error fetching observations:', error);
      return { success: false, error };
    }

    return { success: true, data };
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
        grade_course: obs.gradeCourse,
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
        additional_notes: obs.additionalNotes
      })
      .eq('id', id)
      .select();

    if (error) {
      console.error('Error updating observation:', error);
      return { success: false, error };
    }

    return { success: true, data: data[0] };
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
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching observation:', error);
      return { success: false, error };
    }

    return { success: true, data };
  } catch (err) {
    console.error('Unexpected error fetching observation:', err);
    return { success: false, error: { message: err.message } };
  }
}
