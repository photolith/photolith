import test from 'tape';
import UTIF from 'utif2';

import { setupDom } from './util_dom.js';

import { toImageBitmap } from '../src/image/decode.js';

test('toImageBitmap:TIFF subIFDs', function (test) {
  const dom = setupDom(test);

  // createImageBitmap fails on raw TIFF, succeeds on whatever we decode to
  const bitmapInputs = [];
  dom.window.createImageBitmap = (input) => {
    bitmapInputs.push(input);
    return bitmapInputs.length === 1 ? Promise.reject(new Error('Not supported')) : Promise.resolve('bitmap');
  };

  // Fake UTIF decode: one subIFD without a Compression tag, one with an embedded JPEG
  const origDecode = UTIF.decode;
  test.teardown(() => { UTIF.decode = origDecode; });
  UTIF.decode = () => [{
    subIFD: [
      { t256: [100] },
      { t259: [6], t513: [2], t514: [3] }
    ]
  }];

  const blob = new dom.window.Blob([new Uint8Array([0, 1, 2, 3, 4, 5, 6])]);
  blob.name = 'ut.nef';
  return toImageBitmap(blob).then((rv) => {
    test.deepEqual(rv, 'bitmap', 'Decoded');
    test.deepEqual(bitmapInputs[1].type, 'image/jpeg', 'Embedded JPEG used, subIFD without Compression ignored');
    return bitmapInputs[1].arrayBuffer();
  }).then((buf) => {
    test.deepEqual(Array.from(new Uint8Array(buf)), [2, 3, 4], 'JPEG sliced from offset/length');
  });
});
