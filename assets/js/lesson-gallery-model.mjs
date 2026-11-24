export const IMAGE_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif'
};
export const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

export function validateImage(file) {
  if (!IMAGE_TYPES[file.type]) throw new Error('Use a JPEG, PNG, WebP, GIF, or AVIF image.');
  if (file.size > MAX_IMAGE_SIZE) throw new Error('Each image must be 5 MB or smaller.');
}

export function normalizeGalleries(lesson = {}) {
  return {
    lessonImages: Array.isArray(lesson.lesson_images)
      ? lesson.lesson_images.map(image => ({ ...image }))
      : lesson.diagram_url ? [{ id: 'legacy-diagram', url: lesson.diagram_url }] : [],
    studentWork: (lesson.student_work || []).map(group => ({
      ...group, images: group.images.map(image => ({ ...image }))
    }))
  };
}

export function moveImage(images, index, offset) {
  const target = index + offset;
  if (target < 0 || target >= images.length) return;
  [images[index], images[target]] = [images[target], images[index]];
}

export function nextIndex(index, offset, length) {
  return length ? (index + offset + length) % length : 0;
}

export function validateGalleries({ lessonImages, studentWork }) {
  const seen = new Set();
  function checkImage(image, student) {
    if (!image.id || seen.has(image.id)) throw new Error('Each image needs a unique ID.');
    seen.add(image.id);
    if (!image.file && !image.path && !(image.url && !student)) {
      throw new Error('An image is missing its file or storage location.');
    }
    if (image.file) validateImage(image.file);
  }
  lessonImages.forEach(image => checkImage(image, false));
  studentWork.forEach(group => {
    if (!group.id || seen.has(group.id)) throw new Error('Each implementation needs a unique ID.');
    seen.add(group.id);
    if (!group.date && !group.label?.trim()) {
      throw new Error('Give each student-work implementation a date or class/implementation label.');
    }
    if (group.date && (!/^\d{4}-\d{2}-\d{2}$/.test(group.date) ||
        new Date(`${group.date}T00:00:00Z`).toISOString().slice(0, 10) !== group.date)) {
      throw new Error('Enter a valid implementation date.');
    }
    group.images.forEach(image => checkImage(image, true));
  });
}

// Strip files, blob previews and signed URLs before writing JSONB.
export function serializeGalleries(galleries) {
  validateGalleries(galleries);
  const imageData = (image, student = false) => {
    if (!image.path && (student || !image.url || image.file)) {
      throw new Error('An image has not finished uploading.');
    }
    return {
      id: image.id,
      ...(image.path ? { path: image.path } : { url: image.url }),
      ...(student ? { caption: image.caption?.trim() || '' } : {})
    };
  };
  return {
    lesson_images: galleries.lessonImages.map(image => imageData(image)),
    student_work: galleries.studentWork.map(group => ({
      id: group.id, date: group.date || '', label: group.label?.trim() || '',
      images: group.images.map(image => imageData(image, true))
    }))
  };
}

export function galleryObjects(galleries) {
  return [
    ...galleries.lessonImages.filter(i => i.path).map(i => ({ bucket: 'lesson-images', path: i.path })),
    ...galleries.studentWork.flatMap(g => g.images)
      .filter(i => i.path).map(i => ({ bucket: 'student-work-images', path: i.path }))
  ];
}

export function removedObjects(before, after) {
  const retained = new Set(galleryObjects(after).map(o => `${o.bucket}/${o.path}`));
  return galleryObjects(before).filter(o => !retained.has(`${o.bucket}/${o.path}`));
}

// Successful uploads stay attached to draft state on failure, so retrying a
// save neither reuploads them nor loses references to previously saved files.
export async function prepareGalleryUploads(galleries, upload) {
  validateGalleries(galleries);
  for (const [bucket, images] of [
    ['lesson-images', galleries.lessonImages],
    ['student-work-images', galleries.studentWork.flatMap(g => g.images)]
  ]) {
    for (const image of images) {
      if (!image.file || image.path) continue;
      image.path = await upload(bucket, image.file, image.id);
      delete image.file;
    }
  }
  return serializeGalleries(galleries);
}
