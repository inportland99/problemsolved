import { supabase, getCurrentUser, signOut } from '../supabase-client.js';

export const api = {
  getUser: getCurrentUser,
  signOut,
  async latest(userId) {
    const { data, error } = await supabase.from('vestaboard_rounds').select('*')
      .eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (error) throw new Error('Could not load rounds. The Boggle database upgrade and Edge Function must be deployed first.');
    return data;
  },
  async command(action, roundId) {
    const { data, error } = await supabase.functions.invoke('vestaboard-send', {
      body: { action, ...(roundId ? { roundId } : {}) },
    });
    if (error) {
      let message = 'Request failed. Refresh status before trying again; your round may already have been created.';
      try {
        const body = await error.context.clone().json();
        if (body.error) message = body.error;
      } catch (_) { /* Keep the safe fallback when no server body is available. */ }
      throw new Error(message);
    }
    if (data?.error) throw new Error(data.error);
    return data;
  },
  async dictionary() {
    const response = await fetch('/assets/data/boggle/scowl-35.json');
    if (!response.ok) throw new Error('Dictionary could not be loaded. Try again.');
    return response.json();
  },
  confirm: message => window.confirm(message),
  navigate: path => { window.location.href = path; },
};
