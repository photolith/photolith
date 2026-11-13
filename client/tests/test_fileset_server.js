import test from 'tape';

import { setupDom } from './util_dom.js';

import { ServerFileSet } from '../src/fileset/server.js';

test('ServerFileSet:next', function (test) {
  const dom = setupDom(test);
  const urls = [];
  dom.window.fetch = (url) => {
    urls.push(url);
    return Promise.resolve(new Response(new Blob(['x']), {
      status: 200,
      headers: {
        'X-Photolith-Remaining': '1',
        'Content-Disposition': 'attachment; filename="A+B & C #1 100%.jpg"'
      }
    }));
  };

  const fs = new ServerFileSet('photos');
  return fs.next().then((blob) => {
    test.deepEqual(blob.name, 'A+B & C #1 100%.jpg', 'Filename from Content-Disposition');
    return fs.next();
  }).then(() => {
    test.deepEqual(urls, [
      '/ingest/next-photo/photos/?prev=',
      '/ingest/next-photo/photos/?prev=A%2BB%20%26%20C%20%231%20100%25.jpg'
    ], 'Previous filename encoded in querystring');
    test.deepEqual(new URLSearchParams(urls[1].replace(/^.*\?/, '')).get('prev'), 'A+B & C #1 100%.jpg', 'Server would decode original filename');
  });
});
