import test from 'tape';

import { setupDom } from './util_dom.js';

import { PhotolithFileSet } from '../src/fileset/photolith.js';
import { Cancelled } from '../src/errors.js';

function mockFetch (routes) {
  return function (url) {
    const route = routes[url];
    if (!route) return Promise.reject(new Error(`No mock for ${url}`));
    return Promise.resolve({
      ok: route.status === undefined ? true : route.status < 400,
      status: route.status || 200,
      statusText: route.statusText || 'OK',
      json: () => Promise.resolve(route.json),
      blob: () => Promise.resolve(route.blob)
    });
  };
}

test('PhotolithFileSet:construct', function (test) {
  setupDom(test);

  const fs = new PhotolithFileSet('42,43,99');
  test.equal(fs.name, 'photolith:42,43,99', 'name encodes imageIds');
  test.deepEqual(fs.imageIds, [42, 43, 99], 'imageIds parsed as integers');
  test.equal(fs.remaining(), 3, 'remaining matches imageIds length');
  test.equal(fs.prev, null, 'prev starts null');

  test.end();
});

test('PhotolithFileSet:next', async function (test) {
  setupDom(test);

  const blob42 = { type: 'image/jpeg', tag: 'blob42' };
  const blob43 = { type: 'image/jpeg', tag: 'blob43' };
  global.window.fetch = mockFetch({
    '/search/data?nm_image_id=42&with_associated_images=y&with_annotations=alert': {
      json: {
        data: [
          { ch_slideLabel: 'Slide-A', ch_individualLabel: '1' },
          { ch_slideLabel: 'Slide-A', ch_individualLabel: '2' }
        ],
        images: {
          42: {
            url: '/media/42.jpg',
            orig_filename: 'forty-two.jpg',
            scale_mm: 0.5,
            scale_line: 100
          }
        }
      }
    },
    '/media/42.jpg': { blob: blob42 },
    '/search/data?nm_image_id=43&with_associated_images=y&with_annotations=alert': {
      json: {
        data: [{ ch_slideLabel: 'Slide-B', ch_individualLabel: '1' }],
        images: {
          43: {
            url: '/media/43.jpg',
            orig_filename: 'forty-three.jpg',
            scale_mm: 1,
            scale_line: 200
          }
        }
      }
    },
    '/media/43.jpg': { blob: blob43 }
  });

  const fs = new PhotolithFileSet('42,43');

  const first = await fs.next();
  test.equal(first.image_id, 42, 'first result is image 42');
  test.equal(first.name, 'Slide-A', 'name pulled from first data row ch_slideLabel');
  test.equal(first['slide-label'], 'Slide-A', 'slide-label copied from first data row');
  test.equal(first.scale_mm, 0.5, 'scale_mm from imageMeta');
  test.equal(first.scale_line, 100, 'scale_line from imageMeta');
  test.equal(first.individuals.length, 2, 'all individuals returned');
  test.equal(first.blob, blob42, 'blob from window.fetch');
  test.equal(first.blob.name, 'forty-two.jpg', 'blob renamed to orig_filename');
  test.equal(fs.remaining(), 1, 'one image left after first next()');

  const second = await fs.next();
  test.equal(second.image_id, 43, 'second result is image 43');
  test.equal(second.name, 'Slide-B', 'name from data row');
  test.equal(second.blob, blob43, 'second blob from window.fetch');
  test.equal(fs.remaining(), 0, 'no images left after second next()');

  const finished = await fs.next();
  test.deepEqual(finished, null, 'No more items, returned null');

  test.end();
});

test('PhotolithFileSet:next empty data', async function (test) {
  setupDom(test);

  global.window.fetch = mockFetch({
    '/search/data?nm_image_id=7&with_associated_images=y&with_annotations=alert': {
      json: { data: [], images: {} }
    }
  });

  const fs = new PhotolithFileSet('7');
  const result = await fs.next();
  test.equal(result, null, 'returns null when search returns no data');

  test.end();
});

test('PhotolithFileSet:next image fetch failure', async function (test) {
  setupDom(test);

  global.window.fetch = mockFetch({
    '/search/data?nm_image_id=8&with_associated_images=y&with_annotations=alert': {
      json: {
        data: [{ ch_slideLabel: 'Slide-X' }],
        images: { 8: { url: '/media/8.jpg', orig_filename: '8.jpg' } }
      }
    },
    '/media/8.jpg': { status: 404, statusText: 'Not Found' }
  });

  const fs = new PhotolithFileSet('8');
  try {
    await fs.next();
    test.fail('expected error');
  } catch (e) {
    test.ok(/Failed to fetch/.test(e.message), 'rejects when image fetch returns non-200');
  }

  test.end();
});

test('PhotolithFileSet:cancel', async function (test) {
  setupDom(test);

  // Use a fetch that never resolves, so the in-flight next() can be cancelled
  global.window.fetch = () => new Promise(() => {});

  const fs = new PhotolithFileSet('100');
  const pending = fs.next();
  fs.cancel();
  try {
    await pending;
    test.fail('expected cancellation');
  } catch (e) {
    test.ok(e instanceof Cancelled, 'rejects with Cancelled');
  }

  test.end();
});

test('PhotolithFileSet:close', function (test) {
  setupDom(test);

  const fs = new PhotolithFileSet('1');
  fs.reject = () => { test.pass('reject called by close'); };
  fs.close();
  test.equal(fs.reject, undefined, 'reject cleared after close');

  test.end();
});
