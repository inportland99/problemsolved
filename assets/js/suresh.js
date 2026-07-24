import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// ============================================================
// SUPABASE SETUP
// (same project as the rest of the site — anon key is safe
//  to expose because all sensitive ops are guarded by RLS)
// ============================================================
const SUPABASE_URL = 'https://skgqvheszlquwflignze.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_MpxJeWK8VVF8mjScUtv8qg_4TepfyAG';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================================
// STATE
// ============================================================
let guestbookEntries = [];
let isAdmin = false;
let currentPageIndex = 0;

// ============================================================
// BOOT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  loadPhotoAlbum();
  loadGuestbook();
  initAdminControls();
  initGuestbookForm();
  initLightbox();
  initBookNav();
});

// ============================================================
// PHOTO ALBUM — CAROUSEL
// ============================================================
async function loadPhotoAlbum() {
  const carousel = document.getElementById('album-carousel');
  if (!carousel) return;

  carousel.innerHTML = '<div class="carousel-loading">Loading photos…</div>';

  try {
    const response = await fetch(
      `${SUPABASE_URL}/storage/v1/object/list/suresh-photos`,
      {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prefix: '', limit: 200 }),
      }
    );

    const data = await response.json();

    const photos = (Array.isArray(data) ? data : []).filter(f =>
      f.name && !f.name.startsWith('.') &&
      /\.(jpg|jpeg|png|gif|webp|avif)$/i.test(f.name)
    );

    if (photos.length === 0) {
      carousel.innerHTML = '<div class="carousel-loading">Photos coming soon…</div>';
      ['carousel-prev', 'carousel-next'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
      });
      return;
    }

    const urls = photos.map(f =>
      `${SUPABASE_URL}/storage/v1/object/public/suresh-photos/${encodeURIComponent(f.name)}`
    );

    initCarousel(urls);
  } catch (err) {
    console.error('Album error:', err);
    if (carousel) carousel.innerHTML = '<div class="carousel-loading">Unable to load photos.</div>';
  }
}

function initCarousel(urls) {
  const carousel = document.getElementById('album-carousel');
  const dotsEl   = document.getElementById('carousel-dots');
  const prevBtn  = document.getElementById('carousel-prev');
  const nextBtn  = document.getElementById('carousel-next');

  let current = 0;
  let timer   = null;

  carousel.innerHTML = '';
  dotsEl.innerHTML   = '';

  // Build slides and dots
  urls.forEach((url, i) => {
    const slide = document.createElement('div');
    slide.className = 'carousel-slide' + (i === 0 ? ' active' : '');

    // Blurred background fills the frame for portrait photos
    const bg = document.createElement('div');
    bg.className = 'carousel-slide-bg';
    bg.style.backgroundImage = `url(${url})`;

    const img = document.createElement('img');
    img.src = url;
    img.alt = 'A photo of Suresh';
    img.loading = i === 0 ? 'eager' : 'lazy';
    img.addEventListener('click', () => openLightbox(url, 'image'));

    slide.appendChild(bg);
    slide.appendChild(img);
    carousel.appendChild(slide);

    const dot = document.createElement('button');
    dot.className = 'carousel-dot' + (i === 0 ? ' active' : '');
    dot.setAttribute('aria-label', `Photo ${i + 1} of ${urls.length}`);
    dot.addEventListener('click', () => goTo(i));
    dotsEl.appendChild(dot);
  });

  function goTo(index) {
    const slides = carousel.querySelectorAll('.carousel-slide');
    const dots   = dotsEl.querySelectorAll('.carousel-dot');

    slides[current].classList.remove('active');
    dots[current].classList.remove('active');

    current = ((index % urls.length) + urls.length) % urls.length;

    slides[current].classList.add('active');
    dots[current].classList.add('active');

    resetTimer();
  }

  function resetTimer() {
    clearInterval(timer);
    timer = setInterval(() => goTo(current + 1), 5000);
  }

  prevBtn?.addEventListener('click', () => goTo(current - 1));
  nextBtn?.addEventListener('click', () => goTo(current + 1));

  // Pause on hover, resume on leave
  carousel.addEventListener('mouseenter', () => clearInterval(timer));
  carousel.addEventListener('mouseleave', resetTimer);

  resetTimer();
}

// ============================================================
// GUESTBOOK — LOAD
// ============================================================
async function loadGuestbook() {
  const loadingEl = document.getElementById('book-loading');
  const bookScene = document.getElementById('book-scene');
  const bookControls = document.getElementById('book-controls');

  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/guestbook_entries?select=*&order=created_at.desc`,
      {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
      }
    );

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();

    guestbookEntries = Array.isArray(data) ? data : [];

    if (loadingEl) loadingEl.style.display = 'none';
    if (bookScene) bookScene.style.display = 'flex';
    if (bookControls) bookControls.style.display = 'flex';

    renderBook();
    renderQuicknav();
  } catch (err) {
    console.error('Guestbook load error:', err);
    if (loadingEl) loadingEl.textContent = 'Unable to open the book right now. Please try again shortly.';
  }
}

// ============================================================
// GUESTBOOK — RENDER BOOK
// ============================================================
function renderBook() {
  showPage(currentPageIndex);
}

function getTotalPages() {
  return guestbookEntries.length + 2; // front cover + entries + back cover
}

function showPage(index, fromRight = true) {
  const total = getTotalPages();
  index = ((index % total) + total) % total;
  const contentEl = document.getElementById('book-page-content');
  if (!contentEl) return;

  // Fade out
  contentEl.classList.add('fade-out');

  setTimeout(() => {
    currentPageIndex = index;

    if (index === 0) {
      contentEl.innerHTML = coverHTML('front');
    } else if (index === total - 1) {
      contentEl.innerHTML = coverHTML('back');
    } else if (guestbookEntries.length === 0) {
      contentEl.innerHTML = emptyHTML();
    } else {
      const entry = guestbookEntries[index - 1];
      contentEl.innerHTML = entryHTML(entry, index, guestbookEntries.length);
      wirePageButtons(contentEl, entry);
    }

    contentEl.classList.remove('fade-out');
    updatePageCounter(index, total);
  }, 230);
}

function coverHTML(which) {
  if (which === 'front') {
    return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:1.25rem;">
      <div class="cover-ornament">✦</div>
      <div class="cover-title">A Book of Memories</div>
      <div class="cover-subtitle">Suresh Jagmohan Shah</div>
      <div class="cover-ornament">✦</div>
    </div>`;
  }
  return `<div style="flex:1;display:flex;align-items:center;justify-content:center;"><div class="cover-ornament">✦</div></div>`;
}

function emptyHTML() {
  return `<div style="flex:1;display:flex;align-items:center;justify-content:center;">
    <p style="font-family:'Lora',Georgia,serif;font-style:italic;color:var(--s-warm-gray);text-align:center;font-size:0.95rem;line-height:1.85;">
      No memories yet.<br>Be the first to add one below.
    </p>
  </div>`;
}

function getMediaItems(entry) {
  // Prefer new multi-media array; fall back to legacy single fields
  if (Array.isArray(entry.media_items) && entry.media_items.length > 0) return entry.media_items;
  if (entry.media_url) return [{ url: entry.media_url, path: entry.media_path || '', type: entry.media_type || 'image' }];
  return [];
}

function entryHTML(entry, index, total) {
  const date = new Date(entry.created_at).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  const items = getMediaItems(entry);
  let mediaHtml = '';
  if (items.length === 1) {
    const item = items[0];
    mediaHtml = item.type === 'video'
      ? `<div class="entry-media"><video src="${esc(item.url)}" data-idx="0"></video></div>`
      : `<div class="entry-media"><img src="${esc(item.url)}" alt="Photo" data-idx="0"></div>`;
  } else if (items.length > 1) {
    const thumbs = items.map((item, i) => item.type === 'video'
      ? `<div class="gallery-thumb" data-idx="${i}"><video src="${esc(item.url)}"></video></div>`
      : `<div class="gallery-thumb" data-idx="${i}"><img src="${esc(item.url)}" alt="Photo ${i+1}"></div>`
    ).join('');
    mediaHtml = `<div class="entry-media-gallery">${thumbs}</div>`;
  }

  const adminHtml = isAdmin ? `
    <div class="admin-entry-actions">
      <button class="admin-entry-btn btn-edit-entry">Edit</button>
      <button class="admin-entry-btn btn-delete-entry">Delete</button>
    </div>` : '';

  const myToken = localStorage.getItem(`suresh_entry_${entry.id}`);
  const userEditHtml = (!isAdmin && myToken)
    ? `<button class="user-edit-btn">Edit my memory</button>
       <button class="user-delete-btn">Delete my memory</button>` : '';

  return `
    <div class="entry-header">
      <div class="entry-name">${esc(entry.name)}</div>
      <div class="entry-relationship">${esc(entry.relationship)}</div>
    </div>
    <div class="entry-story">${esc(entry.story)}</div>
    ${mediaHtml}
    <div class="entry-footer">
      <span class="entry-date">${date}</span>
      ${adminHtml}${userEditHtml}
      <span class="entry-number">${index}&thinsp;of&thinsp;${total}</span>
    </div>`;
}

function wirePageButtons(contentEl, entry) {
  contentEl.querySelector('.btn-edit-entry')
    ?.addEventListener('click', () => editEntry(entry.id));
  contentEl.querySelector('.btn-delete-entry')
    ?.addEventListener('click', () => deleteEntry(entry.id));
  contentEl.querySelector('.user-edit-btn')
    ?.addEventListener('click', () => {
      const token = localStorage.getItem(`suresh_entry_${entry.id}`);
      if (token) editMyEntry(entry.id, token);
    });
  contentEl.querySelector('.user-delete-btn')
    ?.addEventListener('click', () => {
      const token = localStorage.getItem(`suresh_entry_${entry.id}`);
      if (token) deleteMyEntry(entry.id, token);
    });

  // Wire media lightbox (single item or gallery)
  const items = getMediaItems(entry);
  contentEl.querySelectorAll('[data-idx]').forEach(el => {
    el.addEventListener('click', () => {
      const item = items[parseInt(el.dataset.idx)];
      if (item) openLightbox(item.url, item.type);
    });
  });
}

function updatePageCounter(index, total) {
  const counter = document.getElementById('page-counter');
  if (counter) {
    counter.textContent = index === 0 ? 'Cover'
      : index === total - 1 ? 'Back cover'
      : `Memory ${index} of ${total - 2}`;
  }
  // Sync active chip
  document.querySelectorAll('.quicknav-chip').forEach(chip => {
    chip.classList.toggle('active', parseInt(chip.dataset.page) === index);
  });
}

function renderQuicknav() {
  const navEl = document.getElementById('book-quicknav');
  if (!navEl) return;
  if (guestbookEntries.length === 0) { navEl.style.display = 'none'; return; }

  navEl.style.display = 'flex';
  navEl.innerHTML = guestbookEntries.map((entry, i) => {
    const firstName = esc(entry.name.split(' ')[0]);
    const active = currentPageIndex === i + 1 ? ' active' : '';
    return `<button class="quicknav-chip${active}" data-page="${i + 1}">${firstName}</button>`;
  }).join('');

  navEl.querySelectorAll('.quicknav-chip').forEach(chip => {
    chip.addEventListener('click', () => showPage(parseInt(chip.dataset.page)));
  });
}

// ============================================================
// BOOK NAV BUTTONS
// ============================================================
function initBookNav() {
  document.getElementById('prev-page')?.addEventListener('click', () => showPage(currentPageIndex - 1, false));
  document.getElementById('next-page')?.addEventListener('click', () => showPage(currentPageIndex + 1, true));
}

// ============================================================
// GUESTBOOK FORM
// ============================================================
function initGuestbookForm() {
  const form = document.getElementById('guestbook-form');
  const mediaInput = document.getElementById('gb-media');
  const mediaPreview = document.getElementById('media-preview');

  // Live file preview + size validation (multiple files)
  mediaInput?.addEventListener('change', () => {
    const files = Array.from(mediaInput.files);
    if (!files.length) return;

    if (files.length > 5) {
      showFormError('Please select up to 5 files.');
      mediaInput.value = '';
      if (mediaPreview) mediaPreview.style.display = 'none';
      return;
    }

    for (const file of files) {
      const isVideo = file.type.startsWith('video/');
      const limit = isVideo ? 50 * 1024 * 1024 : 5 * 1024 * 1024;
      if (file.size > limit) {
        showFormError(isVideo
          ? `"${file.name}" must be under 50 MB.`
          : `"${file.name}" must be under 5 MB.`);
        mediaInput.value = '';
        if (mediaPreview) mediaPreview.style.display = 'none';
        return;
      }
    }

    if (mediaPreview) {
      mediaPreview.style.display = 'flex';
      mediaPreview.innerHTML = files.map(file => {
        const url = URL.createObjectURL(file);
        return file.type.startsWith('image/')
          ? `<img src="${url}" alt="Preview">`
          : `<video src="${url}"></video>`;
      }).join('');
    }
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideFormMessages();

    // Honeypot
    const honeypot = form.querySelector('input[name="website"]');
    if (honeypot?.value) return;

    const submitBtn = document.getElementById('submit-btn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Adding to the book…';

    try {
      const name = document.getElementById('gb-name').value.trim();
      const relationship = document.getElementById('gb-relationship').value.trim();
      const story = document.getElementById('gb-story').value.trim();

      if (!name || !relationship || !story) {
        throw new Error('Please fill in your name, relationship to Suresh, and your memory.');
      }

      const selectedFiles = Array.from(mediaInput?.files || []);
      const mediaItems = [];

      for (const file of selectedFiles) {
        const result = await uploadMedia(file);
        if (!result.success) throw new Error(result.error);
        mediaItems.push({ url: result.url, path: result.path, type: result.type });
      }

      const firstItem = mediaItems[0] || null;
      const media_url = firstItem?.url || null;
      const media_path = firstItem?.path || null;
      const media_type = firstItem?.type || null;

      const editToken = crypto.randomUUID();

      const insertResp = await fetch(
        `${SUPABASE_URL}/rest/v1/guestbook_entries`,
        {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation',
          },
          body: JSON.stringify({ name, relationship, story, media_url, media_path, media_type, media_items: mediaItems, edit_token: editToken }),
        }
      );

      if (!insertResp.ok) {
        const errBody = await insertResp.json().catch(() => ({}));
        throw new Error(errBody.message || `HTTP ${insertResp.status}`);
      }

      const [newEntry] = await insertResp.json();
      if (newEntry?.id) {
        localStorage.setItem(`suresh_entry_${newEntry.id}`, editToken);
      }

      // Reset form
      form.reset();
      if (mediaPreview) { mediaPreview.style.display = 'none'; mediaPreview.innerHTML = ''; }
      document.getElementById('form-success').style.display = 'block';

      // Reload and jump to the new entry (newest = page 1)
      currentPageIndex = 1;
      await loadGuestbook();
      document.getElementById('book-scene')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

    } catch (err) {
      showFormError(err.message || 'Something went wrong. Please try again.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Add to the Book';
    }
  });
}

async function uploadMedia(file) {
  const isImage = file.type.startsWith('image/');
  const isVideo = file.type.startsWith('video/');

  if (!isImage && !isVideo) {
    return { success: false, error: 'Please upload an image or video file.' };
  }

  const limit = isVideo ? 50 * 1024 * 1024 : 5 * 1024 * 1024;
  if (file.size > limit) {
    return { success: false, error: isVideo ? 'Video must be under 50 MB.' : 'Image must be under 5 MB.' };
  }

  const ext = file.name.split('.').pop().toLowerCase();
  const path = `entries/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const uploadResp = await fetch(
    `${SUPABASE_URL}/storage/v1/object/guestbook-media/${path}`,
    {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': file.type,
        'x-upsert': 'false',
      },
      body: file,
    }
  );

  if (!uploadResp.ok) {
    const err = await uploadResp.json().catch(() => ({}));
    return { success: false, error: err.message || `Upload failed (HTTP ${uploadResp.status})` };
  }

  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/guestbook-media/${path}`;

  return {
    success: true,
    url: publicUrl,
    path,
    type: isImage ? 'image' : 'video',
  };
}

function showFormError(msg) {
  const el = document.getElementById('form-error');
  if (el) { el.textContent = msg; el.style.display = 'block'; }
}

function hideFormMessages() {
  ['form-error', 'form-success'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
}

// ============================================================
// LIGHTBOX
// ============================================================
function initLightbox() {
  const lb = document.getElementById('suresh-lightbox');
  document.getElementById('lightbox-close')?.addEventListener('click', closeLightbox);
  lb?.addEventListener('click', (e) => { if (e.target === lb || e.target.className === 'lightbox-inner') closeLightbox(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeLightbox(); });

  // Expose globally for inline onclick in dynamically-generated pages
  window.__sureshLightbox = openLightbox;
}

function openLightbox(url, type) {
  const lb = document.getElementById('suresh-lightbox');
  const img = document.getElementById('lightbox-img');
  const video = document.getElementById('lightbox-video');
  if (!lb) return;

  if (type === 'image') {
    img.src = url;
    img.style.display = 'block';
    if (video) video.style.display = 'none';
  } else {
    if (video) { video.src = url; video.style.display = 'block'; }
    img.style.display = 'none';
  }

  lb.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  const lb = document.getElementById('suresh-lightbox');
  const video = document.getElementById('lightbox-video');
  const img = document.getElementById('lightbox-img');
  if (lb) lb.style.display = 'none';
  if (video) { video.pause(); video.src = ''; video.style.display = 'none'; }
  if (img) { img.src = ''; img.style.display = 'none'; }
  document.body.style.overflow = '';
}

// ============================================================
// ADMIN CONTROLS
// ============================================================
function initAdminControls() {
  const toggleBtn = document.getElementById('admin-toggle');
  const loginForm = document.getElementById('admin-login-form');

  // Check existing session
  supabase.auth.getSession().then(({ data: { session } }) => {
    if (session) applyAdminState(true);
  });

  // React to auth changes
  supabase.auth.onAuthStateChange((_event, session) => {
    applyAdminState(!!session);
  });

  // Toggle login form
  toggleBtn?.addEventListener('click', () => {
    if (!loginForm) return;
    const isOpen = loginForm.style.display !== 'none';
    loginForm.style.display = isOpen ? 'none' : 'flex';
    toggleBtn.setAttribute('aria-expanded', String(!isOpen));
  });

  // Sign in
  document.getElementById('admin-login-btn')?.addEventListener('click', async () => {
    const email = document.getElementById('admin-email').value;
    const password = document.getElementById('admin-password').value;
    const errEl = document.getElementById('admin-login-error');
    if (errEl) errEl.textContent = '';

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      if (errEl) errEl.textContent = 'Invalid credentials.';
    } else {
      if (loginForm) loginForm.style.display = 'none';
      document.getElementById('admin-email').value = '';
      document.getElementById('admin-password').value = '';
    }
  });

  // Sign out
  document.getElementById('admin-logout-btn')?.addEventListener('click', async () => {
    await supabase.auth.signOut();
  });

  // Expose admin actions to inline onclick handlers in book pages
  window.__sureshEdit = editEntry;
  window.__sureshDelete = deleteEntry;
}

function applyAdminState(admin) {
  isAdmin = admin;
  const toggleBtn = document.getElementById('admin-toggle');
  const logoutSection = document.getElementById('admin-logout-section');

  if (admin) {
    if (toggleBtn) toggleBtn.style.display = 'none';
    if (logoutSection) logoutSection.style.display = 'flex';
  } else {
    if (toggleBtn) toggleBtn.style.display = 'block';
    if (logoutSection) logoutSection.style.display = 'none';
  }

  // Re-render current page so edit/delete buttons appear or disappear
  if (guestbookEntries.length >= 0) showPage(currentPageIndex);
}

// ---- Admin: Delete ----
async function deleteEntry(id) {
  if (!confirm('Permanently delete this memory from the book?')) return;

  const entry = guestbookEntries.find(e => e.id === id);
  const token = await getAuthToken();

  // Delete all associated media files
  const paths = getMediaItems(entry || {}).map(i => i.path).filter(Boolean);
  for (const path of paths) {
    await fetch(
      `${SUPABASE_URL}/storage/v1/object/guestbook-media/${encodeURIComponent(path)}`,
      { method: 'DELETE', headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${token}` } }
    );
  }

  const delResp = await fetch(
    `${SUPABASE_URL}/rest/v1/guestbook_entries?id=eq.${id}`,
    {
      method: 'DELETE',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${await getAuthToken()}`,
      },
    }
  );

  if (!delResp.ok) {
    alert('Could not delete entry.');
    return;
  }

  guestbookEntries = guestbookEntries.filter(e => e.id !== id);
  renderBook();
}

// ---- User: Delete own entry ----
async function deleteMyEntry(id, token) {
  if (!confirm('Are you sure you want to remove your memory from the book? This cannot be undone.')) return;

  const entry = guestbookEntries.find(e => e.id === id);
  const paths = getMediaItems(entry || {}).map(i => i.path).filter(Boolean);

  // Delete media files from storage
  for (const path of paths) {
    await fetch(
      `${SUPABASE_URL}/storage/v1/object/guestbook-media/${encodeURIComponent(path)}`,
      { method: 'DELETE', headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` } }
    );
  }

  const resp = await fetch(
    `${SUPABASE_URL}/rest/v1/guestbook_entries?id=eq.${id}&edit_token=eq.${encodeURIComponent(token)}`,
    {
      method: 'DELETE',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
    }
  );

  if (!resp.ok) {
    alert('Could not remove your entry. Please try again.');
    return;
  }

  localStorage.removeItem(`suresh_entry_${id}`);
  guestbookEntries = guestbookEntries.filter(e => e.id !== id);
  currentPageIndex = Math.max(0, currentPageIndex - 1);
  renderBook();
  renderQuicknav();
}

// ---- User: Edit own entry ----
async function editMyEntry(id, token) {
  const entry = guestbookEntries.find(e => e.id === id);
  if (!entry) return;

  document.getElementById('edit-entry-id').value = id;
  document.getElementById('edit-name').value = entry.name;
  document.getElementById('edit-relationship').value = entry.relationship;
  document.getElementById('edit-story').value = entry.story;

  const modal = document.getElementById('edit-modal');
  const errEl = document.getElementById('edit-modal-error');
  if (errEl) errEl.style.display = 'none';
  if (modal) modal.style.display = 'flex';

  document.getElementById('edit-save-btn').onclick = async () => {
    const name = document.getElementById('edit-name').value.trim();
    const relationship = document.getElementById('edit-relationship').value.trim();
    const story = document.getElementById('edit-story').value.trim();

    if (!name || !relationship || !story) {
      if (errEl) { errEl.textContent = 'All fields are required.'; errEl.style.display = 'block'; }
      return;
    }

    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/guestbook_entries?id=eq.${id}&edit_token=eq.${encodeURIComponent(token)}`,
      {
        method: 'PATCH',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({ name, relationship, story }),
      }
    );

    if (!resp.ok) {
      if (errEl) { errEl.textContent = 'Could not save changes.'; errEl.style.display = 'block'; }
      return;
    }

    const idx = guestbookEntries.findIndex(e => e.id === id);
    if (idx >= 0) guestbookEntries[idx] = { ...guestbookEntries[idx], name, relationship, story };
    closeEditModal();
    showPage(currentPageIndex);
  };

  document.getElementById('edit-cancel-btn').onclick = closeEditModal;
  modal.onclick = (e) => { if (e.target === modal) closeEditModal(); };
}

// ---- Admin: Edit ----
function editEntry(id) {
  const entry = guestbookEntries.find(e => e.id === id);
  if (!entry) return;

  document.getElementById('edit-entry-id').value = id;
  document.getElementById('edit-name').value = entry.name;
  document.getElementById('edit-relationship').value = entry.relationship;
  document.getElementById('edit-story').value = entry.story;

  const modal = document.getElementById('edit-modal');
  const errEl = document.getElementById('edit-modal-error');
  if (errEl) errEl.style.display = 'none';
  if (modal) modal.style.display = 'flex';

  document.getElementById('edit-save-btn').onclick = async () => {
    const name = document.getElementById('edit-name').value.trim();
    const relationship = document.getElementById('edit-relationship').value.trim();
    const story = document.getElementById('edit-story').value.trim();

    if (!name || !relationship || !story) {
      if (errEl) { errEl.textContent = 'All fields are required.'; errEl.style.display = 'block'; }
      return;
    }

    const updResp = await fetch(
      `${SUPABASE_URL}/rest/v1/guestbook_entries?id=eq.${id}`,
      {
        method: 'PATCH',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${await getAuthToken()}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({ name, relationship, story }),
      }
    );

    if (!updResp.ok) {
      if (errEl) { errEl.textContent = 'Could not save changes.'; errEl.style.display = 'block'; }
      return;
    }

    // Update local state and re-render
    const idx = guestbookEntries.findIndex(e => e.id === id);
    if (idx >= 0) guestbookEntries[idx] = { ...guestbookEntries[idx], name, relationship, story };

    closeEditModal();
    renderBook();
  };

  document.getElementById('edit-cancel-btn').onclick = closeEditModal;

  // Close on backdrop click
  modal.onclick = (e) => { if (e.target === modal) closeEditModal(); };
}

function closeEditModal() {
  const modal = document.getElementById('edit-modal');
  if (modal) modal.style.display = 'none';
}

// ============================================================
// UTILITIES
// ============================================================

// Returns the current user's JWT for authenticated requests
async function getAuthToken() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token || SUPABASE_ANON_KEY;
}

function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
