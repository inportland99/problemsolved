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

function entryHTML(entry, index, total) {
  const date = new Date(entry.created_at).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  let mediaHtml = '';
  if (entry.media_url && entry.media_type === 'image') {
    mediaHtml = `<div class="entry-media"><img src="${esc(entry.media_url)}" alt="Photo shared by ${esc(entry.name)}"></div>`;
  } else if (entry.media_url && entry.media_type === 'video') {
    mediaHtml = `<div class="entry-media"><video src="${esc(entry.media_url)}"></video></div>`;
  }

  const adminHtml = isAdmin ? `
    <div class="admin-entry-actions">
      <button class="admin-entry-btn btn-edit-entry">Edit</button>
      <button class="admin-entry-btn btn-delete-entry">Delete</button>
    </div>` : '';

  return `
    <div class="entry-header">
      <div class="entry-name">${esc(entry.name)}</div>
      <div class="entry-relationship">${esc(entry.relationship)}</div>
    </div>
    <div class="entry-story">${esc(entry.story)}</div>
    ${mediaHtml}
    <div class="entry-footer">
      <span class="entry-date">${date}</span>
      ${adminHtml}
      <span class="entry-number">${index}&thinsp;of&thinsp;${total}</span>
    </div>`;
}

function wirePageButtons(contentEl, entry) {
  contentEl.querySelector('.btn-edit-entry')
    ?.addEventListener('click', () => editEntry(entry.id));
  contentEl.querySelector('.btn-delete-entry')
    ?.addEventListener('click', () => deleteEntry(entry.id, entry.media_path || ''));
  contentEl.querySelector('.entry-media img')
    ?.addEventListener('click', () => openLightbox(entry.media_url, 'image'));
  contentEl.querySelector('.entry-media video')
    ?.addEventListener('click', () => openLightbox(entry.media_url, 'video'));
}

function updatePageCounter(index, total) {
  const counter = document.getElementById('page-counter');
  if (!counter) return;
  counter.textContent = index === 0 ? 'Cover'
    : index === total - 1 ? 'Back cover'
    : `Memory ${index} of ${total - 2}`;
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

  // Live file preview + size validation
  mediaInput?.addEventListener('change', () => {
    const file = mediaInput.files[0];
    if (!file) return;

    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    const limit = isVideo ? 50 * 1024 * 1024 : 5 * 1024 * 1024;

    if (file.size > limit) {
      showFormError(isVideo ? 'Video must be under 50 MB.' : 'Image must be under 5 MB.');
      mediaInput.value = '';
      if (mediaPreview) mediaPreview.style.display = 'none';
      return;
    }

    if (mediaPreview) {
      const url = URL.createObjectURL(file);
      mediaPreview.style.display = 'block';
      mediaPreview.innerHTML = isImage
        ? `<img src="${url}" alt="Preview">`
        : `<video src="${url}" controls></video>`;
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
      const mediaFile = mediaInput?.files[0];

      if (!name || !relationship || !story) {
        throw new Error('Please fill in your name, relationship to Suresh, and your memory.');
      }

      let media_url = null, media_path = null, media_type = null;

      if (mediaFile) {
        const result = await uploadMedia(mediaFile);
        if (!result.success) throw new Error(result.error);
        media_url = result.url;
        media_path = result.path;
        media_type = result.type;
      }

      const insertResp = await fetch(
        `${SUPABASE_URL}/rest/v1/guestbook_entries`,
        {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
          },
          body: JSON.stringify({ name, relationship, story, media_url, media_path, media_type }),
        }
      );

      if (!insertResp.ok) {
        const errBody = await insertResp.json().catch(() => ({}));
        throw new Error(errBody.message || `HTTP ${insertResp.status}`);
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

  const { data, error } = await supabase.storage
    .from('guestbook-media')
    .upload(path, file, { cacheControl: '3600', upsert: false });

  if (error) return { success: false, error: error.message };

  const { data: urlData } = supabase.storage
    .from('guestbook-media')
    .getPublicUrl(data.path);

  return {
    success: true,
    url: urlData.publicUrl,
    path: data.path,
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
async function deleteEntry(id, mediaPath) {
  if (!confirm('Permanently delete this memory from the book?')) return;

  if (mediaPath) {
    const token = await getAuthToken();
    await fetch(
      `${SUPABASE_URL}/storage/v1/object/guestbook-media/${encodeURIComponent(mediaPath)}`,
      {
        method: 'DELETE',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${token}`,
        },
      }
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
