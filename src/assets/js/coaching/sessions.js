import { getCurrentUser, signOut } from '/assets/js/supabase-client.js';
import {
  getClient, getClientSessions,
  addSession, updateSession, deleteSession, toggleActionItem
} from '/assets/js/coaching/coaching-db.js';
import { showAlert, formatDate, escapeHtml, toDatetimeLocal } from '/assets/js/coaching/ui.js';

// ─── Auth ───
const user = await getCurrentUser();
if (!user) {
  window.location.href = '/personal/coaching/login/';
}

document.getElementById('logout-btn').addEventListener('click', async () => {
  await signOut();
  window.location.href = '/personal/coaching/login/';
});

// ─── Get client ID from URL ───
const params = new URLSearchParams(window.location.search);
const clientId = params.get('client');
if (!clientId) {
  window.location.href = '/personal/coaching/';
}

// ─── State ───
let sessionsData = [];
let viewingSession = null;

// ─── Load Client Info ───
async function loadClientInfo() {
  const result = await getClient(clientId);
  if (!result.success) {
    showAlert('Client not found', 'error');
    setTimeout(() => { window.location.href = '/personal/coaching/'; }, 2000);
    return;
  }
  const client = result.data;
  document.getElementById('session-client-name').textContent = client.name;
  document.getElementById('session-client-info').textContent =
    [client.email, client.phone].filter(Boolean).join(' · ');
  document.getElementById('user-email').textContent = user.email;
}

// ─── Load Sessions ───
async function loadSessions() {
  const emptyState = document.getElementById('empty-sessions');
  const list = document.getElementById('sessions-list');

  emptyState.classList.add('hidden');
  list.innerHTML = '<div class="flex justify-center py-8"><span class="loading loading-spinner loading-lg"></span></div>';

  const result = await getClientSessions(clientId);

  if (!result.success) {
    list.innerHTML = '';
    showAlert(result.error?.message || 'Failed to load sessions', 'error');
    return;
  }

  sessionsData = result.data;

  if (sessionsData.length === 0) {
    list.innerHTML = '';
    emptyState.classList.remove('hidden');
    return;
  }

  list.innerHTML = sessionsData.map(session => {
    const actions = session.action_items || [];
    const completedCount = actions.filter(a => a.completed).length;

    return `
      <div class="card bg-base-100 shadow cursor-pointer hover:shadow-lg transition-shadow session-card" data-session-id="${session.id}">
        <div class="card-body py-4">
          <div class="flex justify-between items-start">
            <div class="flex-1">
              <h3 class="font-bold text-lg">${formatDate(session.session_date)}</h3>
              <p class="text-gray-700 mt-1 line-clamp-2">${escapeHtml(session.summary)}</p>
            </div>
            ${actions.length > 0 ? `
              <div class="badge ${completedCount === actions.length ? 'badge-success' : 'badge-outline'} ml-4">
                ${completedCount}/${actions.length} done
              </div>
            ` : ''}
          </div>
          ${actions.length > 0 ? `
            <div class="mt-3 space-y-1">
              ${actions.map((item, i) => `
                <label class="flex items-center gap-2 cursor-pointer action-checkbox" data-session-id="${session.id}" data-index="${i}">
                  <input type="checkbox" class="checkbox checkbox-sm" ${item.completed ? 'checked' : ''}>
                  <span class="${item.completed ? 'line-through text-gray-400' : ''}">${escapeHtml(item.text)}</span>
                </label>
              `).join('')}
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');

  // Click card to view session details
  list.querySelectorAll('.session-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.action-checkbox')) return;
      const session = sessionsData.find(s => s.id === card.dataset.sessionId);
      if (session) openViewSessionModal(session);
    });
  });

  // Action item checkboxes
  list.querySelectorAll('.action-checkbox input').forEach(checkbox => {
    checkbox.addEventListener('change', async (e) => {
      e.stopPropagation();
      const label = checkbox.closest('.action-checkbox');
      const sessionId = label.dataset.sessionId;
      const index = parseInt(label.dataset.index);

      const result = await toggleActionItem(sessionId, index, checkbox.checked);
      if (result.success) {
        const session = sessionsData.find(s => s.id === sessionId);
        if (session) session.action_items = result.data.action_items;
        loadSessions();
      } else {
        checkbox.checked = !checkbox.checked;
        showAlert('Failed to update action item', 'error');
      }
    });
  });
}

// ─── Session Modal ───
function openAddSessionModal() {
  document.getElementById('session-modal-title').textContent = 'New Session';
  document.getElementById('session-edit-id').value = '';
  document.getElementById('session-date').value = toDatetimeLocal(new Date().toISOString());
  document.getElementById('session-summary').value = '';
  document.getElementById('session-notes').value = '';
  document.querySelectorAll('.action-item-input').forEach(input => { input.value = ''; });
  document.getElementById('session-modal').showModal();
}

function openEditSessionModal(session) {
  document.getElementById('session-modal-title').textContent = 'Edit Session';
  document.getElementById('session-edit-id').value = session.id;
  document.getElementById('session-date').value = toDatetimeLocal(session.session_date);
  document.getElementById('session-summary').value = session.summary;
  document.getElementById('session-notes').value = session.coach_notes || '';

  const inputs = document.querySelectorAll('.action-item-input');
  const actions = session.action_items || [];
  inputs.forEach((input, i) => { input.value = actions[i]?.text || ''; });

  document.getElementById('session-modal').showModal();
}

document.getElementById('save-session-btn').addEventListener('click', async () => {
  const id = document.getElementById('session-edit-id').value;
  const session_date = document.getElementById('session-date').value;
  const summary = document.getElementById('session-summary').value.trim();
  const coach_notes = document.getElementById('session-notes').value.trim() || null;

  if (!session_date || !summary) {
    showAlert('Date and summary are required', 'error');
    return;
  }

  const action_items = Array.from(document.querySelectorAll('.action-item-input'))
    .map(input => input.value.trim())
    .filter(text => text)
    .map(text => ({ text, completed: false }));

  // Preserve completed status when editing
  if (id) {
    const existing = sessionsData.find(s => s.id === id);
    if (existing?.action_items) {
      action_items.forEach(item => {
        const match = existing.action_items.find(a => a.text === item.text);
        if (match) item.completed = match.completed;
      });
    }
  }

  const btn = document.getElementById('save-session-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="loading loading-spinner"></span> Saving...';

  const data = {
    client_id: clientId,
    session_date: new Date(session_date).toISOString(),
    summary,
    coach_notes,
    action_items
  };

  const result = id ? await updateSession(id, data) : await addSession(data);

  btn.disabled = false;
  btn.textContent = 'Save Session';

  if (result.success) {
    showAlert(id ? 'Session updated' : 'Session logged', 'success');
    document.getElementById('session-modal').close();
    loadSessions();
  } else {
    showAlert(result.error?.message || 'Failed to save session', 'error');
  }
});

// ─── View Session Modal ───
function openViewSessionModal(session) {
  viewingSession = session;

  document.getElementById('view-session-date-title').textContent = formatDate(session.session_date);
  document.getElementById('view-session-summary').textContent = session.summary;

  const notesSection = document.getElementById('view-notes-section');
  if (session.coach_notes) {
    document.getElementById('view-session-notes').textContent = session.coach_notes;
    notesSection.classList.remove('hidden');
  } else {
    notesSection.classList.add('hidden');
  }

  const actionsSection = document.getElementById('view-actions-section');
  const actionsContainer = document.getElementById('view-action-items');
  const actions = session.action_items || [];

  if (actions.length > 0) {
    actionsContainer.innerHTML = actions.map(item => `
      <div class="flex items-center gap-2 p-2 bg-base-200 rounded">
        <span class="${item.completed ? 'text-success' : 'text-gray-400'}">
          ${item.completed ? '✓' : '○'}
        </span>
        <span class="${item.completed ? 'line-through text-gray-400' : ''}">${escapeHtml(item.text)}</span>
      </div>
    `).join('');
    actionsSection.classList.remove('hidden');
  } else {
    actionsSection.classList.add('hidden');
  }

  document.getElementById('view-session-modal').showModal();
}

document.getElementById('edit-session-from-view').addEventListener('click', () => {
  document.getElementById('view-session-modal').close();
  if (viewingSession) openEditSessionModal(viewingSession);
});

document.getElementById('delete-session-from-view').addEventListener('click', () => {
  document.getElementById('view-session-modal').close();
  if (viewingSession) {
    document.getElementById('delete-session-id').value = viewingSession.id;
    document.getElementById('delete-session-modal').showModal();
  }
});

// ─── Delete Session ───
document.getElementById('confirm-delete-session').addEventListener('click', async () => {
  const id = document.getElementById('delete-session-id').value;
  const btn = document.getElementById('confirm-delete-session');
  btn.disabled = true;
  btn.innerHTML = '<span class="loading loading-spinner"></span> Deleting...';

  const result = await deleteSession(id);
  btn.disabled = false;
  btn.textContent = 'Delete';

  if (result.success) {
    showAlert('Session deleted', 'info');
    document.getElementById('delete-session-modal').close();
    loadSessions();
  } else {
    showAlert(result.error?.message || 'Failed to delete session', 'error');
  }
});

// ─── Event Listeners ───
document.getElementById('add-session-btn').addEventListener('click', openAddSessionModal);
document.getElementById('add-first-session-btn').addEventListener('click', openAddSessionModal);

// ─── Init ───
await loadClientInfo();
await loadSessions();
