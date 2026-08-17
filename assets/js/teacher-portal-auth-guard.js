import { getCurrentUser, signOut, supabase } from './lessons-supabase-client.js';

/**
 * Check whether the current user is an admin, per the `teachers.role`
 * column in the database (enforced via the `is_admin()` RLS helper
 * function), rather than a hardcoded email address.
 * @returns {Promise<boolean>}
 */
export async function isAdmin() {
  const { data, error } = await supabase.rpc('is_admin');
  if (error) {
    console.error('Error checking admin status:', error);
    return false;
  }
  return data === true;
}

/**
 * Require authentication — redirects to login page if not signed in.
 * Call this at the top of every protected teacher portal page's script block.
 * @returns {Object} The authenticated user object
 */
export async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) {
    window.location.href = '/teacherportal/login/';
    // Throw to stop further script execution on the calling page
    throw new Error('Not authenticated');
  }
  return user;
}

/**
 * Log out and redirect to login page.
 */
export async function logout() {
  await signOut();
  window.location.href = '/teacherportal/login/';
}
