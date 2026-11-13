import test from 'tape';

import { setupDom } from './util_dom.js';

import { PhViewer } from '../src/viewer/base.js';

test('PhViewer:load', function (test) {
  const dom = setupDom(test);

  // Image decoding resolves when we say, so we can control the order loads finish in
  const pending = {};
  dom.window.createImageBitmap = (blob) => new Promise((resolve) => {
    pending[blob.name] = () => {
      const el = dom.window.document.createElement('canvas');
      el.width = blob.name === 'A' ? 100 : 200;
      resolve(el);
    };
  });
  const mkBlob = (name) => {
    const b = new dom.window.Blob(['x']);
    b.name = name;
    return b;
  };

  // NB: JSDOM can't create a fabric canvas, so stub out just what load() uses
  const v = Object.create(PhViewer.prototype);
  v.fabCanvas = {
    requestRenderAll () {},
    phFitBoundingBox () {},
    upperCanvasEl: { parentNode: dom.window.document.createElement('div') }
  };
  v.refreshFilters = () => {};

  // Start loading A, then B. B finishes first
  const pA = v.load(mkBlob('A'));
  const pB = v.load(mkBlob('B'));
  return new Promise((resolve) => setTimeout(resolve, 0)).then(() => {
    pending.B();
    return pB;
  }).then(() => {
    pending.A();
    return pA;
  }).then(() => {
    test.deepEqual(v.fabCanvas.backgroundImage.width, 200, 'Background is still B');
    test.deepEqual(v.imgBlob.name, 'B', 'imgBlob is still B');
  });
});
