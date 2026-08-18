import { getCurrentUser, signOut, supabase } from './lessons-supabase-client.js';
import { getCurrentTeacher } from './teachers-db.js';

function formatRole(role) {
  if (role === 'district_admin') return 'District Admin';
  if (role === 'admin') return 'Admin';
  return 'Teacher';
}

/**
 * Render the current teacher's name and role into a page element, e.g. a
 * navbar badge next to the Logout button. Silently does nothing if the
 * element isn't found or the teacher record can't be loaded.
 * @param {string} elementId
 */
export async function renderUserBadge(elementId) {
  const el = document.getElementById(elementId);
  if (!el) return;

  const result = await getCurrentTeacher();
  if (result.success) {
    el.textContent = `${result.data.name} \u00b7 ${formatRole(result.data.role)}`;
  }
}

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
