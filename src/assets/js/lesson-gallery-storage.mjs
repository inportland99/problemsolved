import { supabase } from './lessons-supabase-client.js';
import { IMAGE_TYPES, validateImage, removedObjects, prepareGalleryUploads } from './lesson-gallery-model.mjs';

export function publicLessonImageUrl(image) {
  return image.path
    ? supabase.storage.from('lesson-images').getPublicUrl(image.path).data.publicUrl
    : image.url;
}

export async function studentWorkImageUrl(image) {
  const { data, error } = await supabase.storage.from('student-work-images')
    .createSignedUrl(image.path, 600);
  if (error) throw new Error('Unable to load student work. Your session or access may have changed.');
  return data.signedUrl;
}

export async function uploadGalleries(galleries, lessonId, userId) {
  return prepareGalleryUploads(galleries, async (bucket, file, imageId) => {
    validateImage(file);
    const path = `${userId}/${lessonId}/${imageId}.${IMAGE_TYPES[file.type]}`;
    const { error } = await supabase.storage.from(bucket).upload(path, file, {
      contentType: file.type, cacheControl: bucket === 'student-work-images' ? '0' : '3600',
      upsert: false
    });
    if (error) throw new Error(`Image upload failed: ${error.message}`);
    return path;
  });
}

export async function cleanupRemovedImages(before, after) {
  const warnings = [];
  for (const bucket of ['lesson-images', 'student-work-images']) {
    const paths = removedObjects(before, after).filter(o => o.bucket === bucket).map(o => o.path);
    if (!paths.length) continue;
    try {
      const { error } = await supabase.storage.from(bucket).remove(paths);
      if (error) warnings.push(`Some removed images could not be deleted from ${bucket}.`);
    } catch {
      warnings.push(`Some removed images could not be deleted from ${bucket}.`);
    }
  }
  return warnings;
}
