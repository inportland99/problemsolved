import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeGalleries, moveImage, nextIndex, validateImage, validateGalleries,
  serializeGalleries, removedObjects, prepareGalleryUploads
} from '../src/assets/js/lesson-gallery-model.mjs';

const file = () => ({ type: 'image/png', size: 100 });
const image = id => ({ id, path: `${id}.png` });
const group = (images = []) => ({ id: 'group', date: '', label: 'Class A', images });

test('legacy diagrams become a single image; an explicit empty gallery stays empty', () => {
  assert.deepEqual(normalizeGalleries({ diagram_url: 'https://example.com/old.png' }).lessonImages,
    [{ id: 'legacy-diagram', url: 'https://example.com/old.png' }]);
  assert.deepEqual(normalizeGalleries({ lesson_images: [], diagram_url: 'old' }).lessonImages, []);
  assert.deepEqual(normalizeGalleries(), { lessonImages: [], studentWork: [] });
});

test('normalization clones image records so draft mutations do not change the loaded row', () => {
  const lesson = { lesson_images: [image('one')], student_work: [group([image('two')])] };
  const draft = normalizeGalleries(lesson);
  draft.lessonImages[0].path = 'changed';
  draft.studentWork[0].images[0].caption = 'changed';
  assert.equal(lesson.lesson_images[0].path, 'one.png');
  assert.equal(lesson.student_work[0].images[0].caption, undefined);
});

test('image movement preserves records and ignores boundary moves', () => {
  const images = [image('a'), image('b'), image('c')];
  moveImage(images, 1, -1);
  assert.deepEqual(images.map(i => i.id), ['b', 'a', 'c']);
  moveImage(images, 0, -1);
  moveImage(images, 2, 1);
  assert.deepEqual(images.map(i => i.id), ['b', 'a', 'c']);
});

test('carousel wraps in both directions and supports zero and one image', () => {
  assert.equal(nextIndex(0, -1, 3), 2);
  assert.equal(nextIndex(2, 1, 3), 0);
  assert.equal(nextIndex(0, 1, 1), 0);
  assert.equal(nextIndex(0, 1, 0), 0);
});

test('serialization keeps order and student captions, never preview/signed URLs or files', () => {
  const galleries = {
    lessonImages: [{ ...image('b'), preview: 'blob:preview', url: 'signed', caption: 'ignored' }, image('a')],
    studentWork: [group([{ ...image('c'), caption: '  Great strategy  ', preview: 'blob:work', url: 'signed' }])]
  };
  const saved = serializeGalleries(galleries);
  assert.deepEqual(saved.lesson_images, [image('b'), image('a')]);
  assert.equal(saved.student_work[0].images[0].caption, 'Great strategy');
  assert.equal(saved.student_work[0].images[0].url, undefined);
  assert.equal(saved.student_work[0].images[0].preview, undefined);
});

test('implementations require a label or valid date; captions remain optional', () => {
  assert.throws(() => validateGalleries({ lessonImages: [], studentWork: [{ ...group(), label: '  ' }] }), /date or/);
  assert.throws(() => validateGalleries({
    lessonImages: [], studentWork: [{ ...group(), date: '2026-02-30' }]
  }), /valid implementation date/);
  const saved = serializeGalleries({
    lessonImages: [], studentWork: [{ ...group([image('student')]), date: '2026-11-09', label: '' }]
  });
  assert.equal(saved.student_work[0].images[0].caption, '');
});

test('duplicate image IDs and student images without private storage locations are rejected', () => {
  assert.throws(() => validateGalleries({
    lessonImages: [image('one')], studentWork: [group([image('one')])]
  }), /unique ID/);
  assert.throws(() => serializeGalleries({
    lessonImages: [], studentWork: [group([{ id: 'one', url: 'https://public/work.png' }])]
  }), /missing its file/);
});

test('uploads accept raster images up to 5 MB and reject SVG, HEIC, and oversize files', () => {
  validateImage({ type: 'image/jpeg', size: 5 * 1024 * 1024 });
  for (const type of ['image/svg+xml', 'image/heic', 'text/html']) {
    assert.throws(() => validateImage({ type, size: 100 }), /JPEG/);
  }
  assert.throws(() => validateImage({ type: 'image/png', size: 5 * 1024 * 1024 + 1 }), /5 MB/);
});

test('cleanup only removes dropped storage paths, never retained or legacy URL images', () => {
  const before = { lessonImages: [image('a'), image('b'), { id: 'legacy', url: 'https://example.com/old' }],
    studentWork: [group([image('c')])] };
  const after = { lessonImages: [image('b')], studentWork: [] };
  assert.deepEqual(removedObjects(before, after), [
    { bucket: 'lesson-images', path: 'a.png' },
    { bucket: 'student-work-images', path: 'c.png' }
  ]);
});

test('partial upload failure preserves existing images and resumes without duplicate uploads', async () => {
  const pendingA = { id: 'a', file: file(), preview: 'blob:a' };
  const pendingB = { id: 'b', file: file(), preview: 'blob:b' };
  const galleries = { lessonImages: [image('old'), pendingA], studentWork: [group([pendingB])] };
  const uploaded = [];
  await assert.rejects(prepareGalleryUploads(galleries, async (bucket, _file, id) => {
    uploaded.push(`${bucket}/${id}`);
    if (id === 'b') throw new Error('offline');
    return `${id}.png`;
  }), /offline/);
  assert.equal(galleries.lessonImages[0].path, 'old.png');
  assert.equal(pendingA.path, 'a.png');
  assert.equal(pendingA.file, undefined);
  assert.ok(pendingB.file);
  const saved = await prepareGalleryUploads(galleries, async (bucket, _file, id) => {
    uploaded.push(`${bucket}/${id}`);
    return `${id}.png`;
  });
  assert.deepEqual(uploaded, ['lesson-images/a', 'student-work-images/b', 'student-work-images/b']);
  assert.equal(saved.student_work[0].images[0].path, 'b.png');
});

test('retrying after metadata save failure reuses all previously uploaded paths', async () => {
  const galleries = { lessonImages: [{ id: 'a', file: file() }], studentWork: [] };
  const first = await prepareGalleryUploads(galleries, async () => 'uploaded.png');
  const retry = await prepareGalleryUploads(galleries, async () => assert.fail('must not reupload'));
  assert.deepEqual(retry, first);
});

test('group removal leaves retained implementation images untouched', () => {
  const before = { lessonImages: [], studentWork: [group([image('a')]), { ...group([image('b')]), id: 'other' }] };
  const after = { lessonImages: [], studentWork: [before.studentWork[1]] };
  assert.deepEqual(removedObjects(before, after), [{ bucket: 'student-work-images', path: 'a.png' }]);
});
