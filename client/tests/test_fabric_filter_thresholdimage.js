import test from 'tape';

import { ThresholdImage } from '../src/fabric/filter_thresholdimage.js';

test('ThresholdImage:applyTo2d', function (test) {
  // 2x1 thresholded image: background, foreground
  const image = new Uint8ClampedArray([0x10, 0x11]);
  image.phWidth = 2;
  image.phHeight = 1;

  // Semi-transparent source pixels
  const imageData = { width: 2, height: 1, data: new Uint8ClampedArray([9, 9, 9, 128, 9, 9, 9, 0]) };
  new ThresholdImage({ image }).applyTo2d({ imageData });
  test.deepEqual(Array.from(imageData.data), [0, 0, 0, 255, 255, 255, 255, 255], 'Monochrome & opaque, as WebGL');

  test.end();
});
