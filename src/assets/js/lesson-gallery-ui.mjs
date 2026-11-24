import { normalizeGalleries, moveImage, nextIndex, validateImage } from './lesson-gallery-model.mjs';
import { publicLessonImageUrl, studentWorkImageUrl } from './lesson-gallery-storage.mjs';

function element(tag, className = '', text = '') {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

function button(text, action, className = 'btn btn-sm btn-outline') {
  const node = element('button', className, text);
  node.type = 'button';
  node.addEventListener('click', action);
  return node;
}

async function imageUrl(image, student) {
  if (image.preview) return image.preview;
  return student ? studentWorkImageUrl(image) : publicLessonImageUrl(image);
}

export function createGalleryEditor(lessonContainer, studentContainer, reportError) {
  let galleries = normalizeGalleries();
  let knownLessonImages = [];
  let knownStudentImages = [];
  const previews = new Set();

  function renderImageList(container, images, student) {
    container.replaceChildren();
    const list = element('div', 'space-y-3 mt-3');
    const uploadLabel = element('label', 'block text-sm');
    uploadLabel.append(element('span', 'block mb-2', 'Add images (JPEG, PNG, WebP, GIF, AVIF; max 5 MB each)'));
    const upload = element('input', 'file-input file-input-bordered w-full');
    upload.type = 'file';
    upload.accept = 'image/jpeg,image/png,image/webp,image/gif,image/avif';
    upload.multiple = true;
    upload.addEventListener('change', () => {
      for (const file of upload.files) {
        try {
          validateImage(file);
          const image = { id: crypto.randomUUID(), file, preview: URL.createObjectURL(file) };
          previews.add(image.preview);
          images.push(image);
          (student ? knownStudentImages : knownLessonImages).push(image);
        } catch (error) {
          reportError(`${file.name}: ${error.message}`);
        }
      }
      renderImageList(container, images, student);
    });
    uploadLabel.append(upload);
    container.append(uploadLabel, list);
    if (!images.length) list.append(element('p', 'text-sm text-base-content/60', 'No images added.'));
    images.forEach((image, index) => {
      const row = element('div', 'border border-base-300 rounded-lg p-3 space-y-2');
      const preview = element('img', 'max-h-40 max-w-full rounded');
      preview.alt = `${student ? 'Student work' : 'Lesson image'} ${index + 1}`;
      // Resolve lazily after insertion; a failed preview never discards metadata.
      imageUrl(image, student).then(url => { preview.src = url; }).catch(error => {
        row.prepend(element('p', 'text-sm text-error', error.message));
      });
      const controls = element('div', 'flex flex-wrap items-center gap-2');
      controls.append(element('span', 'text-sm', `Image ${index + 1}`));
      const up = button('Move up', () => {
        moveImage(images, index, -1);
        renderImageList(container, images, student);
      });
      up.disabled = index === 0;
      const down = button('Move down', () => {
        moveImage(images, index, 1);
        renderImageList(container, images, student);
      });
      down.disabled = index === images.length - 1;
      controls.append(up, down, button('Remove image', () => {
        images.splice(index, 1);
        renderImageList(container, images, student);
      }, 'btn btn-sm btn-outline btn-error'));
      row.append(preview, controls);
      if (student) {
        const label = element('label', 'block text-sm');
        label.append(element('span', 'block mb-1', 'Caption (optional)'));
        const caption = element('textarea', 'textarea textarea-bordered w-full');
        caption.rows = 2;
        caption.value = image.caption || '';
        caption.addEventListener('input', () => { image.caption = caption.value; });
        label.append(caption);
        row.append(label);
      }
      list.append(row);
    });
  }

  function renderStudentWork() {
    studentContainer.replaceChildren();
    const groups = element('div', 'space-y-4');
    galleries.studentWork.forEach(group => {
      const section = element('fieldset', 'border border-base-300 rounded-lg p-4 space-y-3');
      section.append(element('legend', 'font-semibold px-1', 'Implementation'));
      const fields = element('div', 'grid grid-cols-1 sm:grid-cols-2 gap-3');
      for (const [key, title, type] of [
        ['date', 'Date (optional)', 'date'],
        ['label', 'Class / implementation label (optional)', 'text']
      ]) {
        const label = element('label', 'block text-sm');
        label.append(element('span', 'block mb-1', title));
        const input = element('input', 'input input-bordered w-full');
        input.type = type;
        input.value = group[key] || '';
        input.addEventListener('input', () => { group[key] = input.value; });
        label.append(input);
        fields.append(label);
      }
      const images = element('div');
      renderImageList(images, group.images, true);
      section.append(fields, images, button('Remove implementation', () => {
        if (!window.confirm('Remove this implementation and its images from the lesson when you save?')) return;
        galleries.studentWork.splice(galleries.studentWork.indexOf(group), 1);
        renderStudentWork();
      }, 'btn btn-sm btn-outline btn-error'));
      groups.append(section);
    });
    studentContainer.append(groups, button('Add implementation', () => {
      galleries.studentWork.push({ id: crypto.randomUUID(), date: '', label: '', images: [] });
      renderStudentWork();
    }, 'btn btn-sm btn-outline mt-3'));
  }

  function render() {
    renderImageList(lessonContainer, galleries.lessonImages, false);
    renderStudentWork();
  }
  render();
  return {
    getState: () => galleries,
    // Includes images removed from a draft after a failed upload/save attempt.
    getCleanupBaseline: () => ({
      lessonImages: knownLessonImages, studentWork: [{ images: knownStudentImages }]
    }),
    setLesson(lesson) {
      for (const url of previews) URL.revokeObjectURL(url);
      previews.clear();
      galleries = normalizeGalleries(lesson);
      knownLessonImages = [...galleries.lessonImages];
      knownStudentImages = galleries.studentWork.flatMap(group => group.images);
      render();
    },
    dispose() {
      for (const url of previews) URL.revokeObjectURL(url);
      previews.clear();
    }
  };
}

export function createGalleryLightbox() {
  const dialog = element('dialog', 'modal');
  dialog.setAttribute('aria-label', 'Image viewer');
  const box = element('div', 'modal-box max-w-6xl w-full bg-base-100');
  const content = element('div');
  const close = button('Close', () => {
    content.replaceChildren();
    dialog.close();
  });
  const fullscreen = button('Fullscreen', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await box.requestFullscreen?.();
    } catch { /* Fullscreen is optional on browsers that do not support it. */ }
  });
  const controls = element('div', 'flex justify-end gap-2 mb-3');
  controls.append(fullscreen, close);
  box.append(controls, content);
  dialog.append(box);
  document.body.append(dialog);
  dialog.addEventListener('close', () => {
    if (dialog.open) return; // A queued close event may follow a rapid reopen.
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    content.replaceChildren(); // Do not leave signed student-work URLs in a closed viewer.
  });
  return (images, student, index) => {
    renderCarousel(content, images, { student, initialIndex: index });
    dialog.showModal();
  };
}

export function renderCarousel(container, images, { student = false, initialIndex = 0, openLightbox } = {}) {
  container.replaceChildren();
  if (!images.length) return;
  let index = initialIndex;
  let request = 0;
  const figure = element('figure', 'flex flex-col space-y-2');
  const image = element('img', 'max-w-full max-h-[65vh] object-contain mx-auto rounded-lg');
  const caption = element('figcaption', 'text-sm whitespace-pre-wrap');
  const status = element('p', 'text-sm text-base-content/70');
  status.setAttribute('aria-live', 'polite');
  const controls = element('div', 'flex items-center justify-center gap-3 mt-3');
  const counter = element('span', 'text-sm');
  counter.setAttribute('aria-live', 'polite');
  async function show() {
    const ticket = ++request;
    image.removeAttribute('src');
    image.alt = `${student ? 'Student work' : 'Lesson image'} ${index + 1}`;
    caption.textContent = student ? images[index].caption || '' : '';
    caption.hidden = !caption.textContent;
    counter.textContent = `${index + 1} / ${images.length}`;
    status.textContent = 'Loading image…';
    try {
      const url = await imageUrl(images[index], student);
      if (ticket !== request) return;
      image.src = url;
      status.textContent = '';
    } catch (error) {
      if (ticket === request) status.textContent = error.message;
    }
  }
  image.addEventListener('error', () => { status.textContent = 'Image unavailable. Try another image or reload the page.'; });
  const navigate = offset => { index = nextIndex(index, offset, images.length); show(); };
  controls.append(button('Previous', () => navigate(-1)), counter, button('Next', () => navigate(1)));
  controls.hidden = images.length <= 1;
  if (openLightbox) {
    const enlarge = button('', () => openLightbox(images, student, index), 'block w-full cursor-zoom-in');
    enlarge.setAttribute('aria-label', 'Enlarge image');
    enlarge.append(image);
    figure.append(enlarge);
  } else {
    figure.append(image);
    container.tabIndex = 0;
    container.onkeydown = event => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        navigate(event.key === 'ArrowLeft' ? -1 : 1);
      }
    };
  }
  figure.append(caption);
  container.append(figure, status, controls);
  show();
}
