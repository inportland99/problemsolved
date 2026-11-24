import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Run the actual browser data layer with in-memory module dependencies.
// No secrets, network, browser session, or hosted Supabase project are used.
const moduleUrl = source => `data:text/javascript,${encodeURIComponent(source)}`;
const clientUrl = moduleUrl(`
  export const state = { rows: [], writes: [], deny: false, fail: false };
  export const getCurrentUser = async () => ({ id: 'user' });
  export const supabase = {
    from() {
      let operation = 'read', values, id, single = false;
      const query = {
        insert(rows) { operation = 'insert'; values = rows[0]; return query; },
        update(row) { operation = 'update'; values = row; return query; },
        select() { return query; }, order() { return query; },
        eq(_key, value) { id = value; return query; },
        single() { single = true; return query; },
        then(resolve) {
          if (state.fail && operation !== 'read') return Promise.resolve(resolve({ data: null, error: { message: 'offline' } }));
          if (operation !== 'read') state.writes.push({ operation, values });
          if (operation === 'insert') state.rows.push({ ...values });
          const rows = state.rows.filter(row => !id || row.id === id);
          if (operation === 'update' && !state.deny) rows.forEach(row => Object.assign(row, values));
          const data = state.deny && operation === 'update' ? [] : rows;
          return Promise.resolve(resolve({ data: single ? data[0] : data, error: null }));
        }
      };
      return query;
    }
  };
`);
const taxonomyUrl = moduleUrl(`
  export const state = { fail: false };
  export const flattenLessonMathTopics = () => [];
  export const setLessonMathTopics = async () => state.fail
    ? { success: false, error: { message: 'taxonomy unavailable' } } : { success: true };
`);
const storageUrl = moduleUrl(`
  export const publicLessonImageUrl = image => image.path ? 'https://public.example/' + image.path : image.url;
`);
const modelUrl = new URL('../src/assets/js/lesson-gallery-model.mjs', import.meta.url).href;
let source = await readFile(new URL('../src/assets/js/lessons-db.js', import.meta.url), 'utf8');
for (const [path, url] of [
  ['./lessons-supabase-client.js', clientUrl],
  ['./taxonomy-db.js', taxonomyUrl],
  ['./lesson-gallery-model.mjs', modelUrl],
  ['./lesson-gallery-storage.mjs', storageUrl]
]) source = source.replaceAll(`'${path}'`, JSON.stringify(url));
const db = await import(moduleUrl(source));
const { state } = await import(clientUrl);
const { state: taxonomy } = await import(taxonomyUrl);

const gallery = () => ({
  lessonImages: [{ id: 'first', path: 'one.png' }, { id: 'second', path: 'two.png' }],
  studentWork: [{ id: 'implementation', label: 'Class A', date: '', images: [
    { id: 'work', path: 'work.png', caption: 'Strategy' }
  ] }]
});
function reset() {
  state.rows = [];
  state.writes = [];
  state.deny = false;
  state.fail = false;
  taxonomy.fail = false;
}

test('create sends both gallery metadata fields in the lesson INSERT with a fixed UUID', async () => {
  reset();
  const result = await db.createLesson({ id: 'fixed-id', title: 'Lesson', galleries: gallery() });
  assert.equal(result.success, true);
  assert.equal(state.writes.length, 1);
  const row = state.writes[0].values;
  assert.equal(row.id, 'fixed-id');
  assert.equal(row.created_by, 'user');
  assert.equal(row.diagram_url, 'https://public.example/one.png');
  assert.equal(row.lesson_images.length, 2);
  assert.equal(row.student_work[0].images[0].caption, 'Strategy');
});

test('update keeps ordered metadata and compatibility thumbnail in the same row write', async () => {
  reset();
  state.rows.push({ id: 'lesson' });
  const galleries = gallery();
  galleries.lessonImages.reverse();
  const result = await db.updateLesson('lesson', { galleries });
  assert.equal(result.success, true);
  const row = state.writes[0].values;
  assert.equal(row.diagram_url, 'https://public.example/two.png');
  assert.equal(row.lesson_images[0].id, 'second');
  assert.equal(row.student_work.length, 1);
});

test('reads use the first gallery image and do not resurrect a deliberately removed diagram', async () => {
  reset();
  state.rows.push({ id: 'a', lesson_images: gallery().lessonImages, diagram_url: 'old' });
  state.rows.push({ id: 'b', lesson_images: [], diagram_url: 'old' });
  state.rows.push({ id: 'c', diagram_url: 'https://example.com/legacy.png' });
  const result = await db.getAllLessons();
  assert.equal(result.data[0].diagram_url, 'https://public.example/one.png');
  assert.equal(result.data[1].diagram_url, null);
  assert.equal(result.data[2].diagram_url, 'https://example.com/legacy.png');
});

test('a taxonomy failure returns the saved row so the UI retries UPDATE instead of duplicating INSERT', async () => {
  reset();
  taxonomy.fail = true;
  const result = await db.createLesson({
    id: 'fixed-id', galleries: gallery(), mathContentSelection: { taxonomyIds: [1] }
  });
  assert.equal(result.success, false);
  assert.equal(result.data.id, 'fixed-id');
  assert.equal(state.rows[0].student_work.length, 1);
  taxonomy.fail = false;
  const retry = await db.updateLesson(result.data.id, { galleries: gallery() });
  assert.equal(retry.success, true);
  assert.equal(state.rows.length, 1);
});

test('permission-denied or failed row writes never report gallery save success', async () => {
  reset();
  state.rows.push({ id: 'lesson' });
  state.deny = true;
  assert.equal((await db.updateLesson('lesson', { galleries: gallery() })).success, false);
  assert.equal(state.rows[0].student_work, undefined);
  state.deny = false;
  state.fail = true;
  assert.equal((await db.updateLesson('lesson', { galleries: gallery() })).success, false);
  assert.equal(state.rows[0].student_work, undefined);
});
