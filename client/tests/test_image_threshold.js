import test from 'tape';

import { thresholdOtsu, thresholdLocalOtsu } from '../src/image/threshold.js';

function makeImageData (width, height, pixels) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < pixels.length; i += 1) {
    data[i * 4] = pixels[i][0];
    data[i * 4 + 1] = pixels[i][1];
    data[i * 4 + 2] = pixels[i][2];
    data[i * 4 + 3] = 255;
  }
  return { data, width, height };
}

test('otsuThreshold:bimodal', function (test) {
  // Two dark (lum 50) and two light (lum 200) pixels. Otsu picks the first
  // split that separates the modes (t=50), then packs: dark → LSB 0 (output
  // stays 50), light → LSB 1 (200 → 201).
  const out = thresholdOtsu(makeImageData(2, 2, [
    [50, 50, 50], [50, 50, 50],
    [200, 200, 200], [200, 200, 200]
  ]));

  test.ok(out instanceof Uint8ClampedArray, 'Returns a Uint8ClampedArray');
  test.equal(out.length, 4, 'One byte per pixel');
  test.deepEqual(Array.from(out), [50, 50, 201, 201], 'Dark pixels below threshold, light pixels above');
  test.end();
});

test('otsuThreshold:lsb_overwrites_grayscale_bit', function (test) {
  // Luminances 51 and 201 both have bit 0 set. The packing step must mask
  // that bit off before OR-ing in the threshold result, otherwise pixels
  // below the threshold would still come out with LSB=1.
  const out = thresholdOtsu(makeImageData(2, 2, [
    [51, 51, 51], [51, 51, 51],
    [201, 201, 201], [201, 201, 201]
  ]));

  test.deepEqual(Array.from(out), [50, 50, 201, 201], 'Bit 0 of input gray is discarded, replaced by comparison result');
  test.end();
});

test('otsuThreshold:trimodal_picks_widest_separation', function (test) {
  // Three equal-sized modes at 10, 100, 200. Splitting between the upper two
  // (t=100) gives variance 8*4*145² = 672800, vs. splitting between the
  // lower two (t=10) which only gives 4*8*140² = 627200. So Otsu groups
  // {10, 100} as class 1 and {200} as class 2.
  const out = thresholdOtsu(makeImageData(12, 1, [
    [10, 10, 10], [10, 10, 10], [10, 10, 10], [10, 10, 10],
    [100, 100, 100], [100, 100, 100], [100, 100, 100], [100, 100, 100],
    [200, 200, 200], [200, 200, 200], [200, 200, 200], [200, 200, 200]
  ]));

  test.deepEqual(Array.from(out), [
    10, 10, 10, 10,
    100, 100, 100, 100,
    201, 201, 201, 201
  ], 'Threshold lands between the 100 and 200 modes');
  test.end();
});

test('otsuThreshold:luminance_uses_rec709', function (test) {
  // Verify the grayscale conversion: pure red, green, blue map to the
  // Rec. 709 luminance coefficients (0.299, 0.587, 0.114) * 255, truncated.
  // Pure white sums to ~255 but lands at 254 after floating-point and `| 0`.
  // With one pixel in each of bins {29, 76, 149, 254}, Otsu's balanced split
  // wins at t=76 (variance 2·2·149² beats either 3-vs-1 split), so red and
  // blue end up below the threshold while green and white land above.
  const out = thresholdOtsu(makeImageData(4, 1, [
    [255, 0, 0], // 0.299 * 255 = 76.245 → 76
    [0, 255, 0], // 0.587 * 255 = 149.685 → 149
    [0, 0, 255], // 0.114 * 255 = 29.07  → 29
    [255, 255, 255] // ~255 → 254
  ]));

  // The high 7 bits should preserve those luminance values (masked).
  test.deepEqual([
    out[0] & 0xFE,
    out[1] & 0xFE,
    out[2] & 0xFE,
    out[3] & 0xFE
  ], [76, 148, 28, 254], 'Upper 7 bits hold Rec. 709 luminance (bit 0 masked off)');

  // Red (76) and blue (29) are at/below the threshold; green and white above.
  test.deepEqual([out[0] & 1, out[1] & 1, out[2] & 1, out[3] & 1], [0, 1, 0, 1], 'Green and white pixels above Otsu threshold (t=76)');
  test.end();
});

function makeUniformImage (width, height, gray) {
  const pixels = [];
  for (let i = 0; i < width * height; i += 1) pixels.push([gray, gray, gray]);
  return makeImageData(width, height, pixels);
}

test('thresholdLocalOtsu:output_format', function (test) {
  // 50x50 uniform mid-gray — we don't care about the threshold result here,
  // just the shape and metadata that downstream consumers rely on.
  const out = thresholdLocalOtsu(makeUniformImage(50, 50, 128));

  test.ok(out instanceof Uint8ClampedArray, 'Returns a Uint8ClampedArray');
  test.equal(out.length, 2500, 'One byte per pixel');
  test.equal(out.phWidth, 50, 'phWidth set on result');
  test.equal(out.phHeight, 50, 'phHeight set on result');
  test.end();
});

test('thresholdLocalOtsu:uniform_image_has_no_pixels_above_local_mean', function (test) {
  // In a uniform region, the local Gaussian mean equals every pixel's value,
  // so the strict comparison `image > local_mean` is false everywhere — even
  // at the edges, because reflect padding sees the same uniform value.
  const out = thresholdLocalOtsu(makeUniformImage(50, 50, 80));

  let anyBitSet = 0;
  for (let i = 0; i < out.length; i += 1) anyBitSet |= out[i] & 1;
  test.equal(anyBitSet, 0, 'No pixel reports above its local mean');

  // Luminance is preserved in the top 7 bits (80 has bit 0 clear already).
  test.equal(out[0] & 0xFE, 80, 'Uniform luminance preserved');
  test.equal(out[out.length - 1] & 0xFE, 80, 'Corner luminance preserved (reflect mode)');
  test.end();
});

test('thresholdLocalOtsu:step_boundary_splits_dark_and_bright', function (test) {
  // 100x10 image: columns 0..49 are dark (50), columns 50..99 are bright (200).
  // With width=100 the block size lands on 11 (10% rounded up to odd),
  // sigma=10/6, so the Gaussian neighbourhood straddles the boundary across
  // a handful of columns on either side. Near the boundary the local mean
  // is somewhere between 50 and 200, so dark pixels fall below it and bright
  // ones rise above. Pixels deep inside either flat region are uniform and
  // therefore stay at bit 0 (`image > image` is false).
  const W = 100;
  const H = 10;
  const pixels = [];
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      pixels.push(x < W / 2 ? [50, 50, 50] : [200, 200, 200]);
    }
  }
  const out = thresholdLocalOtsu(makeImageData(W, H, pixels));

  const yMid = 5;
  const bitAt = (x, y) => out[y * W + x] & 1;
  const lumAt = (x, y) => out[y * W + x] & 0xFE;

  test.equal(bitAt(49, yMid), 0, 'Dark pixel just left of boundary is below local mean');
  test.equal(bitAt(50, yMid), 1, 'Bright pixel just right of boundary is above local mean');
  test.equal(bitAt(0, yMid), 0, 'Far-left dark interior is uniform → bit 0');
  test.equal(bitAt(W - 1, yMid), 0, 'Far-right bright interior is uniform → bit 0');

  test.equal(lumAt(10, yMid), 50, 'Dark luminance preserved in top 7 bits');
  test.equal(lumAt(90, yMid), 200, 'Bright luminance preserved in top 7 bits');
  test.end();
});

test('thresholdLocalOtsu:isolated_bright_spike_is_above_local_mean', function (test) {
  // A single bright pixel embedded in an otherwise dark field. The local
  // Gaussian mean at the spike is dragged down by all the surrounding dark
  // neighbours, so the spike itself ends up well above its own local mean
  // (bit 1). Its dark neighbours' local means rise slightly above 50, but
  // not above 50 itself for pixels several taps away, so they stay at bit 0.
  const W = 50;
  const H = 50;
  const pixels = [];
  for (let i = 0; i < W * H; i += 1) pixels.push([50, 50, 50]);
  pixels[25 * W + 25] = [250, 250, 250];
  const out = thresholdLocalOtsu(makeImageData(W, H, pixels));

  test.equal(out[25 * W + 25] & 1, 1, 'Spike pixel above its local mean');
  test.equal(out[25 * W + 25] & 0xFE, 250, 'Spike luminance preserved');
  test.equal(out[0] & 1, 0, 'Corner far from spike stays at bit 0');
  test.equal(out[(W * H) - 1] & 1, 0, 'Opposite corner stays at bit 0');
  test.end();
});

test('thresholdLocalOtsu:luminance_uses_rec709', function (test) {
  // Same Rec. 709 conversion as thresholdOtsu — verified independently here
  // because thresholdLocalOtsu maintains its own gray buffer for the
  // convolution. A 1-pixel-tall image avoids the question of which pixel
  // dominates the local mean: with only one row, every pixel is its own
  // column and the upper 7 bits are the only invariant we check.
  const out = thresholdLocalOtsu(makeImageData(4, 1, [
    [255, 0, 0], // 76
    [0, 255, 0], // 149
    [0, 0, 255], // 29
    [255, 255, 255] // 254
  ]));

  test.deepEqual([
    out[0] & 0xFE,
    out[1] & 0xFE,
    out[2] & 0xFE,
    out[3] & 0xFE
  ], [54, 182, 18, 254], 'Upper 7 bits hold Rec. 709 luminance (bit 0 masked off)');
  test.end();
});
