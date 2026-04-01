import { getCurrentUser, signOut } from './lessons-supabase-client.js';

const ADMIN_EMAIL = 'raj@drrajshah.com';

/**
 * Require authentication — redirects to login page if not signed in.
 * Call this at the top of every protected reyn page's script block.
 * @returns {Object} The authenticated user object
 */
export function isAdmin(user) {
  return user?.email === ADMIN_EMAIL;
}

export async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) {
    window.location.href = '/reyn/login/';
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
  window.location.href = '/reyn/login/';
}
