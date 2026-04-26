import { getCurrentUser, signOut } from '/assets/js/supabase-client.js';
import { getClients, addClient, updateClient, deleteClient } from '/assets/js/coaching/coaching-db.js';
import { showAlert, escapeHtml } from '/assets/js/coaching/ui.js';

// ─── Auth ───
const user = await getCurrentUser();
if (!user) {
  window.location.href = '/personal/coaching/login/';
} else {
  document.getElementById('user-email').textContent = user.email;
}

document.getElementById('logout-btn').addEventListener('click', async () => {
  await signOut();
  window.location.href = '/personal/coaching/login/';
});

// ─── State ───
let clientsData = [];

// ─── Load Clients ───
async function loadClients() {
  const loading = document.getElementById('loading');
  const emptyState = document.getElementById('empty-clients');
  const grid = document.getElementById('clients-grid');

  loading.classList.remove('hidden');
  emptyState.classList.add('hidden');
  grid.classList.add('hidden');

  const result = await getClients();
  loading.classList.add('hidden');

  if (!result.success) {
    showAlert(result.error?.message || 'Failed to load clients', 'error');
    return;
  }

  clientsData = result.data;

  if (clientsData.length === 0) {
    emptyState.classList.remove('hidden');
    return;
  }

  grid.classList.remove('hidden');
  grid.innerHTML = clientsData.map(client => `
    <div class="card bg-base-100 shadow-xl hover:shadow-2xl transition-shadow cursor-pointer" data-client-id="${client.id}">
      <div class="card-body">
        <h2 class="card-title">${escapeHtml(client.name)}</h2>
        ${client.email ? `<p class="text-sm text-gray-600">${escapeHtml(client.email)}</p>` : ''}
        ${client.phone ? `<p class="text-sm text-gray-600">${escapeHtml(client.phone)}</p>` : ''}
        <div class="badge badge-outline mt-2">${client.session_count} session${client.session_count !== 1 ? 's' : ''}</div>
        <div class="card-actions justify-end mt-4">
          <button class="btn btn-sm btn-outline btn-primary edit-client-btn" data-id="${client.id}">Edit</button>
          <button class="btn btn-sm btn-outline btn-error delete-client-btn" data-id="${client.id}">Delete</button>
        </div>
      </div>
    </div>
  `).join('');

  // Click card body to navigate to sessions page
  grid.querySelectorAll('[data-client-id]').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.edit-client-btn') || e.target.closest('.delete-client-btn')) return;
      window.location.href = `/personal/coaching/sessions/?client=${card.dataset.clientId}`;
    });
  });

  // Edit buttons
  grid.querySelectorAll('.edit-client-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const client = clientsData.find(c => c.id === btn.dataset.id);
      if (client) openEditClientModal(client);
    });
  });

  // Delete buttons
  grid.querySelectorAll('.delete-client-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const client = clientsData.find(c => c.id === btn.dataset.id);
      if (client) openDeleteClientModal(client);
    });
  });
}

// ─── Client Modal ───
function openAddClientModal() {
  document.getElementById('client-modal-title').textContent = 'Add Client';
  document.getElementById('client-edit-id').value = '';
  document.getElementById('client-name').value = '';
  document.getElementById('client-email').value = '';
  document.getElementById('client-phone').value = '';
  document.getElementById('client-notes').value = '';
  document.getElementById('client-modal').showModal();
}

function openEditClientModal(client) {
  document.getElementById('client-modal-title').textContent = 'Edit Client';
  document.getElementById('client-edit-id').value = client.id;
  document.getElementById('client-name').value = client.name;
  document.getElementById('client-email').value = client.email || '';
  document.getElementById('client-phone').value = client.phone || '';
  document.getElementById('client-notes').value = client.notes || '';
  document.getElementById('client-modal').showModal();
}

document.getElementById('save-client-btn').addEventListener('click', async () => {
  const id = document.getElementById('client-edit-id').value;
  const name = document.getElementById('client-name').value.trim();
  const email = document.getElementById('client-email').value.trim() || null;
  const phone = document.getElementById('client-phone').value.trim() || null;
  const notes = document.getElementById('client-notes').value.trim() || null;

  if (!name) { showAlert('Name is required', 'error'); return; }

  const btn = document.getElementById('save-client-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="loading loading-spinner"></span> Saving...';

  const result = id
    ? await updateClient(id, { name, email, phone, notes })
    : await addClient({ name, email, phone, notes });

  btn.disabled = false;
  btn.textContent = 'Save Client';

  if (result.success) {
    showAlert(id ? 'Client updated' : 'Client added', 'success');
    document.getElementById('client-modal').close();
    loadClients();
  } else {
    showAlert(result.error?.message || 'Failed to save client', 'error');
  }
});

// ─── Delete Client ───
function openDeleteClientModal(client) {
  document.getElementById('delete-client-id').value = client.id;
  document.getElementById('delete-client-name').textContent = client.name;
  document.getElementById('delete-client-modal').showModal();
}

document.getElementById('confirm-delete-client').addEventListener('click', async () => {
  const id = document.getElementById('delete-client-id').value;
  const btn = document.getElementById('confirm-delete-client');
  btn.disabled = true;
  btn.innerHTML = '<span class="loading loading-spinner"></span> Deleting...';

  const result = await deleteClient(id);
  btn.disabled = false;
  btn.textContent = 'Delete';

  if (result.success) {
    showAlert('Client deleted', 'info');
    document.getElementById('delete-client-modal').close();
    loadClients();
  } else {
    showAlert(result.error?.message || 'Failed to delete client', 'error');
  }
});

// ─── Event Listeners ───
document.getElementById('add-client-btn').addEventListener('click', openAddClientModal);
document.querySelectorAll('.add-client-trigger').forEach(btn => btn.addEventListener('click', openAddClientModal));

// ─── Init ───
loadClients();
