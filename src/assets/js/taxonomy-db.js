import { supabase } from './lessons-supabase-client.js';

/**
 * Get the full active taxonomy (Grade/Course + Domain + Math Topic
 * combinations), flattened and joined with display names.
 * @returns {Object} { success: boolean, data: Array<{id, ccssReference, sortOrder, gradeCourse, gradeCourseSortOrder, domain, domainSortOrder, topic}>, error }
 */
export async function getTaxonomy() {
  try {
    const { data, error } = await supabase
      .from('taxonomy')
      .select(`
        id,
        ccss_reference,
        sort_order,
        grade_course:grades_courses ( id, name, sort_order ),
        domain:domains ( id, name, sort_order ),
        math_topic:math_topics ( id, name )
      `)
      .eq('active', true)
      .order('sort_order');

    if (error) {
      console.error('Error fetching taxonomy:', error);
      return { success: false, error };
    }

    const flattened = (data || []).map(row => ({
      id: row.id,
      ccssReference: row.ccss_reference,
      sortOrder: row.sort_order,
      gradeCourse: row.grade_course?.name,
      gradeCourseSortOrder: row.grade_course?.sort_order,
      domain: row.domain?.name,
      domainSortOrder: row.domain?.sort_order,
      topic: row.math_topic?.name
    }));

    return { success: true, data: flattened };
  } catch (err) {
    console.error('Unexpected error fetching taxonomy:', err);
    return { success: false, error: { message: err.message } };
  }
}

/**
 * Flatten the nested `lesson_math_topics(is_primary, taxonomy:taxonomy_id(...))`
 * shape returned by a Supabase nested select (see getAllLessons/getLessonById
 * in lessons-db.js) into a simple array for templates to consume.
 * @param {Array} rows - lesson.lesson_math_topics from a nested select
 * @returns {Array<{taxonomyId, isPrimary, gradeCourse, domain, topic}>}
 */
export function flattenLessonMathTopics(rows) {
  return (rows || [])
    .map(r => ({
      taxonomyId: r.taxonomy?.id,
      isPrimary: !!r.is_primary,
      gradeCourse: r.taxonomy?.grade_course?.name,
      domain: r.taxonomy?.domain?.name,
      topic: r.taxonomy?.math_topic?.name
    }))
    .filter(t => t.taxonomyId != null);
}

/**
 * Replace a lesson's tagged Math Topics with the given selection.
 * Deletes all existing lesson_math_topics rows for the lesson and
 * re-inserts the current set, marking at most one as primary.
 * @param {string} lessonId
 * @param {Object} selection - { taxonomyIds: number[], primaryTaxonomyId: number|null }
 * @returns {Object} { success: boolean, error }
 */
export async function setLessonMathTopics(lessonId, selection = {}) {
  const { taxonomyIds = [], primaryTaxonomyId = null } = selection;

  try {
    const { error: deleteError } = await supabase
      .from('lesson_math_topics')
      .delete()
      .eq('lesson_id', lessonId);

    if (deleteError) {
      console.error('Error clearing lesson math topics:', deleteError);
      return { success: false, error: deleteError };
    }

    if (taxonomyIds.length === 0) {
      return { success: true };
    }

    const rows = taxonomyIds.map(taxonomyId => ({
      lesson_id: lessonId,
      taxonomy_id: taxonomyId,
      is_primary: taxonomyId === primaryTaxonomyId
    }));

    const { error: insertError } = await supabase
      .from('lesson_math_topics')
      .insert(rows);

    if (insertError) {
      console.error('Error saving lesson math topics:', insertError);
      return { success: false, error: insertError };
    }

    return { success: true };
  } catch (err) {
    console.error('Unexpected error saving lesson math topics:', err);
    return { success: false, error: { message: err.message } };
  }
}
