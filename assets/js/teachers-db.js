import { supabase, getCurrentUser } from './lessons-supabase-client.js';

/**
 * Get the teacher directory visible to the current user (own record, admin
 * sees everyone, others see their own district's roster). Used to populate
 * the "observed teacher" picker on the observation form.
 * @returns {Object} { success: boolean, data: array, error: object }
 */
export async function getTeacherRoster() {
  try {
    const { data, error } = await supabase
      .from('teachers')
      .select('id, name, email, district_id')
      .order('name', { ascending: true });

    if (error) {
      console.error('Error fetching teacher roster:', error);
      return { success: false, error };
    }

    return { success: true, data };
  } catch (err) {
    console.error('Unexpected error fetching teacher roster:', err);
    return { success: false, error: { message: err.message } };
  }
}

/**
 * Get the teachers row for the currently authenticated user.
 * @returns {Object} { success: boolean, data: object, error: object }
 */
export async function getCurrentTeacher() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: { message: 'Not authenticated' } };
    }

    const { data, error } = await supabase
      .from('teachers')
      .select('*')
      .eq('auth_id', user.id)
      .single();

    if (error) {
      console.error('Error fetching current teacher record:', error);
      return { success: false, error };
    }

    return { success: true, data };
  } catch (err) {
    console.error('Unexpected error fetching current teacher record:', err);
    return { success: false, error: { message: err.message } };
  }
}

/**
 * Get every teacher row (admin-only per RLS), including district info.
 * @returns {Object} { success: boolean, data: array, error: object }
 */
export async function getAllTeachers() {
  try {
    const { data, error } = await supabase
      .from('teachers')
      .select('*, districts(name)')
      .order('name', { ascending: true });

    if (error) {
      console.error('Error fetching all teachers:', error);
      return { success: false, error };
    }

    return { success: true, data };
  } catch (err) {
    console.error('Unexpected error fetching all teachers:', err);
    return { success: false, error: { message: err.message } };
  }
}

/**
 * Create a teachers row for an already-invited auth user (admin-only per RLS).
 * @param {Object} teacher - { authId, name, email, districtId, role }
 * @returns {Object} { success: boolean, data: object, error: object }
 */
export async function createTeacherRow(teacher) {
  try {
    const { data, error } = await supabase
      .from('teachers')
      .insert([{
        auth_id: teacher.authId,
        name: teacher.name,
        email: teacher.email,
        district_id: teacher.districtId || null,
        role: teacher.role || 'teacher'
      }])
      .select();

    if (error) {
      console.error('Error creating teacher row:', error);
      return { success: false, error };
    }

    return { success: true, data: data[0] };
  } catch (err) {
    console.error('Unexpected error creating teacher row:', err);
    return { success: false, error: { message: err.message } };
  }
}

/**
 * Update a teacher's name/district/role (admin-only per RLS).
 * @param {string} id - The teachers.id to update
 * @param {Object} updates - { name, districtId, role }
 * @returns {Object} { success: boolean, data: object, error: object }
 */
export async function updateTeacherRow(id, updates) {
  try {
    const updateData = {};

    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.districtId !== undefined) updateData.district_id = updates.districtId;
    if (updates.role !== undefined) updateData.role = updates.role;

    const { data, error } = await supabase
      .from('teachers')
      .update(updateData)
      .eq('id', id)
      .select();

    if (error) {
      console.error('Error updating teacher row:', error);
      return { success: false, error };
    }

    return { success: true, data: data[0] };
  } catch (err) {
    console.error('Unexpected error updating teacher row:', err);
    return { success: false, error: { message: err.message } };
  }
}

/**
 * Delete a teachers row (admin-only per RLS). Does NOT revoke the underlying
 * Supabase Auth login -- call the teacherportal-admin Edge Function's
 * "remove" action for that first.
 * @param {string} id - The teachers.id to delete
 * @returns {Object} { success: boolean, error: object }
 */
export async function deleteTeacherRow(id) {
  try {
    const { error } = await supabase
      .from('teachers')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting teacher row:', error);
      return { success: false, error };
    }

    return { success: true };
  } catch (err) {
    console.error('Unexpected error deleting teacher row:', err);
    return { success: false, error: { message: err.message } };
  }
}
