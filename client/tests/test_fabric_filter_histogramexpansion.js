import test from 'tape';

import { HistogramExpansion } from '../src/fabric/filter_histogramexpansion.js';

function lutFor (bins) {
  const histogram = new Uint32Array(256);
  Object.entries(bins).forEach(([i, count]) => { histogram[i] = count; });
  return Array.from(new HistogramExpansion({ histogramExpansion: 1, histogram })._buildLut());
}

test('HistogramExpansion:_buildLut', function (test) {
  const lut = lutFor({ 100: 10, 200: 10 });
  test.deepEqual([lut[0], lut[99], lut[100], lut[150], lut[200], lut[255]], [0, 0, 0, 0, 255, 255], 'Lowest populated bin pinned to 0, highest to 255');

  const identity = Array.from({ length: 256 }, (_, i) => i);
  test.deepEqual(lutFor({ 100: 50 }), identity, 'Single populated bin (flat region) leaves intensities unchanged');
  test.deepEqual(lutFor({}), identity, 'Empty histogram leaves intensities unchanged');

  test.end();
});
