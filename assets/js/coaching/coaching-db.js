import { supabase, getCurrentUser } from '/assets/js/supabase-client.js';

// ─── Clients ───

export async function getClients() {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: { message: 'You must be logged in' } };

    const { data, error } = await supabase
      .from('coaching_clients')
      .select('*, coaching_sessions(id)')
      .eq('coach_id', user.id)
      .order('name');

    if (error) return { success: false, error };

    // Add session_count to each client
    const clients = data.map(c => ({
      ...c,
      session_count: c.coaching_sessions?.length || 0,
      coaching_sessions: undefined
    }));

    return { success: true, data: clients };
  } catch (err) {
    return { success: false, error: { message: err.message } };
  }
}

export async function getClient(id) {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: { message: 'You must be logged in' } };

    const { data, error } = await supabase
      .from('coaching_clients')
      .select('*')
      .eq('id', id)
      .eq('coach_id', user.id)
      .single();

    if (error) return { success: false, error };
    return { success: true, data };
  } catch (err) {
    return { success: false, error: { message: err.message } };
  }
}

export async function addClient({ name, email, phone, notes }) {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: { message: 'You must be logged in' } };

    const { data, error } = await supabase
      .from('coaching_clients')
      .insert([{ coach_id: user.id, name, email, phone, notes }])
      .select();

    if (error) return { success: false, error };
    return { success: true, data: data[0] };
  } catch (err) {
    return { success: false, error: { message: err.message } };
  }
}

export async function updateClient(id, updates) {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: { message: 'You must be logged in' } };

    const { data, error } = await supabase
      .from('coaching_clients')
      .update(updates)
      .eq('id', id)
      .eq('coach_id', user.id)
      .select();

    if (error) return { success: false, error };
    return { success: true, data: data[0] };
  } catch (err) {
    return { success: false, error: { message: err.message } };
  }
}

export async function deleteClient(id) {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: { message: 'You must be logged in' } };

    const { error } = await supabase
      .from('coaching_clients')
      .delete()
      .eq('id', id)
      .eq('coach_id', user.id);

    if (error) return { success: false, error };
    return { success: true };
  } catch (err) {
    return { success: false, error: { message: err.message } };
  }
}

// ─── Sessions ───

export async function getClientSessions(clientId) {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: { message: 'You must be logged in' } };

    const { data, error } = await supabase
      .from('coaching_sessions')
      .select('*')
      .eq('coach_id', user.id)
      .eq('client_id', clientId)
      .order('session_date', { ascending: false });

    if (error) return { success: false, error };
    return { success: true, data };
  } catch (err) {
    return { success: false, error: { message: err.message } };
  }
}

export async function addSession({ client_id, session_date, summary, coach_notes, action_items }) {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: { message: 'You must be logged in' } };

    const { data, error } = await supabase
      .from('coaching_sessions')
      .insert([{
        coach_id: user.id,
        client_id,
        session_date,
        summary,
        coach_notes,
        action_items: action_items || []
      }])
      .select();

    if (error) return { success: false, error };
    return { success: true, data: data[0] };
  } catch (err) {
    return { success: false, error: { message: err.message } };
  }
}

export async function updateSession(id, updates) {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: { message: 'You must be logged in' } };

    const { data, error } = await supabase
      .from('coaching_sessions')
      .update(updates)
      .eq('id', id)
      .eq('coach_id', user.id)
      .select();

    if (error) return { success: false, error };
    return { success: true, data: data[0] };
  } catch (err) {
    return { success: false, error: { message: err.message } };
  }
}

export async function deleteSession(id) {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: { message: 'You must be logged in' } };

    const { error } = await supabase
      .from('coaching_sessions')
      .delete()
      .eq('id', id)
      .eq('coach_id', user.id);

    if (error) return { success: false, error };
    return { success: true };
  } catch (err) {
    return { success: false, error: { message: err.message } };
  }
}

export async function toggleActionItem(sessionId, actionIndex, completed) {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: { message: 'You must be logged in' } };

    // Fetch current session to get action_items
    const { data: session, error: fetchError } = await supabase
      .from('coaching_sessions')
      .select('action_items')
      .eq('id', sessionId)
      .eq('coach_id', user.id)
      .single();

    if (fetchError) return { success: false, error: fetchError };

    const items = [...(session.action_items || [])];
    if (actionIndex < 0 || actionIndex >= items.length) {
      return { success: false, error: { message: 'Invalid action index' } };
    }

    items[actionIndex] = { ...items[actionIndex], completed };

    const { data, error } = await supabase
      .from('coaching_sessions')
      .update({ action_items: items })
      .eq('id', sessionId)
      .eq('coach_id', user.id)
      .select();

    if (error) return { success: false, error };
    return { success: true, data: data[0] };
  } catch (err) {
    return { success: false, error: { message: err.message } };
  }
}
