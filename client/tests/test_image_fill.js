import test from 'tape';

import { floodFill, floodFillBounds, floodFillHistogram } from '../src/image/fill.js';

// Build a thresholdOtsu-shaped mono image from ASCII art. '#' marks pixels
// whose threshold bit (bit 0) is set, '.' marks pixels that are not. A
// constant non-trivial luminance (0x80) is OR-ed into every cell so the
// callback's `lum` argument can be verified to match `value & 0xFE`.
function makeMonoImage (rows) {
  const height = rows.length;
  const width = rows[0].length;
  const mono = new Uint8ClampedArray(width * height);
  mono.phWidth = width;
  mono.phHeight = height;
  for (let y = 0; y < height; y += 1) {
    if (rows[y].length !== width) throw new Error('ragged row in test image');
    for (let x = 0; x < width; x += 1) {
      mono[y * width + x] = 0x80 | (rows[y][x] === '#' ? 1 : 0);
    }
  }
  return mono;
}

// Run floodFill from (refX, refY) and return the visited cells in callback
// order. `image` is treated as read-only — floodFill tracks visits in its
// own bitmap. A 1024-call cap guards against an infinite loop turning a
// failing test into a hang. `refVal` is passed through to floodFill so
// individual tests can target foreground (1), background (0), or let the
// seed's own bit decide (undefined).
function collectFilled (image, refX, refY, refVal) {
  const visited = [];
  floodFill(image, refX, refY, refVal, (x, y, lum) => {
    visited.push({ x, y, lum });
    if (visited.length > 1024) throw new Error('floodFill exceeded 1024 callbacks — likely revisiting cells');
  });
  return visited;
}

test('floodFill:single_pixel_region', function (test) {
  // A '#' pixel surrounded by '.' — every 4-neighbour fails Inside, so the
  // fill must visit exactly one pixel: the start.
  const image = makeMonoImage([
    '...',
    '.#.',
    '...'
  ]);

  const visited = collectFilled(image, 1, 1, 1);

  test.equal(visited.length, 1, 'Exactly one pixel visited');
  test.deepEqual({ x: visited[0].x, y: visited[0].y }, { x: 1, y: 1 }, 'Visits the start pixel');
  test.equal(visited[0].lum, 0x80, 'Callback receives the luminance bits with bit 0 masked off');
  test.end();
});

test('floodFill:solid_rectangle', function (test) {
  // A 3x3 block of '#' inside a '.' frame. Every interior cell is reachable
  // via 4-connectivity; the frame must be left alone.
  const image = makeMonoImage([
    '.....',
    '.###.',
    '.###.',
    '.###.',
    '.....'
  ]);

  const visited = collectFilled(image, 2, 2, 1);
  const coords = new Set(visited.map((v) => v.x + ',' + v.y));

  test.equal(visited.length, 9, 'All 9 interior pixels visited');
  test.equal(coords.size, 9, 'Each visited pixel is unique (no span re-queued)');
  for (let y = 1; y <= 3; y += 1) {
    for (let x = 1; x <= 3; x += 1) {
      test.ok(coords.has(x + ',' + y), '(' + x + ',' + y + ') was visited');
    }
  }
  test.notOk(coords.has('0,0'), 'Frame pixel (0,0) not visited');
  test.notOk(coords.has('4,4'), 'Frame pixel (4,4) not visited');
  test.end();
});

test('floodFill:diagonal_neighbour_is_not_connected', function (test) {
  // 4-connectivity: a '#' at (0,0) and another at (1,1) are NOT connected
  // even though they touch diagonally. Filling from (0,0) must leave (1,1)
  // untouched.
  const image = makeMonoImage([
    '#..',
    '.#.',
    '..#'
  ]);

  const visited = collectFilled(image, 0, 0, 1);

  test.equal(visited.length, 1, 'Only the starting pixel is reached');
  test.deepEqual({ x: visited[0].x, y: visited[0].y }, { x: 0, y: 0 }, 'Visits only (0,0)');
  test.end();
});

test('floodFill:concave_region_with_hole', function (test) {
  // A donut: a 5x5 ring of '#' around a hollow centre with an isolated '#'
  // at (2,2). The fill from any boundary pixel should cover the perimeter
  // without leaking through the '.' moat to the centre '#'.
  const image = makeMonoImage([
    '#####',
    '#...#',
    '#.#.#',
    '#...#',
    '#####'
  ]);

  const visited = collectFilled(image, 0, 0, 1);
  const coords = new Set(visited.map((v) => v.x + ',' + v.y));

  test.equal(visited.length, 16, 'All 16 perimeter pixels visited');
  test.equal(coords.size, 16, 'Each perimeter pixel visited exactly once');
  test.notOk(coords.has('2,2'), 'Isolated centre # not visited');
  test.notOk(coords.has('1,1'), 'Hole pixel (1,1) not visited');
  test.notOk(coords.has('3,3'), 'Hole pixel (3,3) not visited');
  test.end();
});

test('floodFill:disconnected_regions_are_independent', function (test) {
  // Two '#' regions separated by a '.' wall. Filling from inside one must
  // not reach the other.
  const image = makeMonoImage([
    '##.##',
    '##.##',
    '##.##'
  ]);

  const visited = collectFilled(image, 0, 1, 1);
  const coords = new Set(visited.map((v) => v.x + ',' + v.y));

  test.equal(visited.length, 6, 'Left region (6 cells) filled');
  test.ok(coords.has('0,0'), 'Top-left corner of left region visited');
  test.ok(coords.has('1,2'), 'Bottom-right corner of left region visited');
  test.notOk(coords.has('3,0'), 'Right region not reached');
  test.notOk(coords.has('4,2'), 'Right region not reached');
  test.end();
});

test('floodFill:region_against_image_edge', function (test) {
  // The connected region runs all the way to the image edges. The algorithm
  // must not read outside [0, phWidth) × [0, phHeight) when checking Inside
  // for its neighbours.
  const image = makeMonoImage([
    '###',
    '#.#',
    '###'
  ]);

  const visited = collectFilled(image, 0, 0, 1);
  const coords = new Set(visited.map((v) => v.x + ',' + v.y));

  test.equal(visited.length, 8, 'All 8 boundary cells visited, centre skipped');
  test.equal(coords.size, 8, 'Each boundary cell visited exactly once');
  test.notOk(coords.has('1,1'), 'Centre (.) not visited');
  test.end();
});

test('floodFill:seed_on_zero_bit_is_noop_when_refVal_is_one', function (test) {
  // With refVal=1 the fill targets foreground only, regardless of the seed.
  // Seeding on a '.' cell makes the seed itself fail Inside, so the fill
  // terminates immediately with no callbacks — even if there are reachable
  // '#' pixels nearby.
  const image = makeMonoImage([
    '#####',
    '#...#',
    '#...#',
    '#...#',
    '#####'
  ]);

  const visited = collectFilled(image, 2, 2, 1);

  test.equal(visited.length, 0, 'No pixels visited when seed bit ≠ refVal');
  test.end();
});

test('floodFill:seed_on_zero_bit_with_refVal_one_does_not_leak', function (test) {
  // Even seeding on a '.' immediately adjacent to a '#' pixel must not leak
  // into the '#' region when refVal=1: the seed's Inside check fails, so no
  // spans are ever enqueued.
  const image = makeMonoImage([
    '.###',
    '.###',
    '.###'
  ]);

  const visited = collectFilled(image, 0, 1, 1);

  test.equal(visited.length, 0, 'Seed bit determines termination, not neighbours');
  test.end();
});

test('floodFill:undefined_refVal_takes_seed_bit', function (test) {
  // With refVal=undefined, the seed pixel's own bit 0 becomes the target.
  // Seeding on a '.' cell here fills the hollow centre but stops at the
  // surrounding '#' frame — i.e. it's a background fill driven by the seed.
  const image = makeMonoImage([
    '#####',
    '#...#',
    '#...#',
    '#...#',
    '#####'
  ]);

  const visited = collectFilled(image, 2, 2, undefined);
  const coords = new Set(visited.map((v) => v.x + ',' + v.y));

  test.equal(visited.length, 9, 'All 9 background cells visited');
  test.equal(coords.size, 9, 'Each background cell visited exactly once');
  for (let y = 1; y <= 3; y += 1) {
    for (let x = 1; x <= 3; x += 1) {
      test.ok(coords.has(x + ',' + y), 'Background (' + x + ',' + y + ') was visited');
    }
  }
  test.notOk(coords.has('0,0'), 'Frame pixel (0,0) not visited');
  test.notOk(coords.has('2,0'), 'Frame pixel (2,0) not visited');
  test.end();
});

test('floodFill:explicit_refVal_zero_selects_background', function (test) {
  // With refVal=0 the fill targets background cells. Seeding inside the
  // hollow centre yields the same 9 cells as the undefined-refVal case, but
  // here the choice is explicit and independent of where the seed lands.
  const image = makeMonoImage([
    '#####',
    '#...#',
    '#...#',
    '#...#',
    '#####'
  ]);

  const visited = collectFilled(image, 2, 2, 0);

  test.equal(visited.length, 9, 'All 9 background cells visited');
  test.end();
});

test('floodFill:explicit_refVal_zero_with_foreground_seed_is_noop', function (test) {
  // Mirror of the seed_on_zero_bit_is_noop_when_refVal_is_one case: with
  // refVal=0, a seed on a '#' cell fails Inside and the fill terminates.
  const image = makeMonoImage([
    '#####',
    '#...#',
    '#...#',
    '#...#',
    '#####'
  ]);

  const visited = collectFilled(image, 0, 0, 0);

  test.equal(visited.length, 0, 'No pixels visited when seed bit ≠ refVal');
  test.end();
});

test('floodFillBounds:solid_rectangle_no_border', function (test) {
  // A 3x3 '#' block inside a '.' frame. With border=0 the returned bounds
  // are the half-open box around the visited cells (x2/y2 are the inclusive
  // max coordinate, since no clamping is needed).
  const image = makeMonoImage([
    '.....',
    '.###.',
    '.###.',
    '.###.',
    '.....'
  ]);

  const bounds = floodFillBounds(image, 2, 2, 0);

  test.deepEqual(bounds, { x1: 1, y1: 1, x2: 3, y2: 3 }, 'Bounds match the 3x3 block exactly');
  test.end();
});

test('floodFillBounds:border_expands_in_all_directions', function (test) {
  // Same 3x3 block with room around it. A border of 1 expands each side by
  // one without hitting any image edge, so no clamping happens.
  const image = makeMonoImage([
    '.....',
    '.###.',
    '.###.',
    '.###.',
    '.....'
  ]);

  const bounds = floodFillBounds(image, 2, 2, 1);

  test.deepEqual(bounds, { x1: 0, y1: 0, x2: 4, y2: 4 }, 'Each side grown by 1');
  test.end();
});

test('floodFillBounds:border_clamped_to_image_edges', function (test) {
  // Region touches every edge of the image. A border of 3 would push the
  // bounds outside [0, phWidth] / [0, phHeight], so x1/y1 clamp to 0 and
  // x2/y2 clamp to phWidth/phHeight (exclusive upper, matching the source).
  const image = makeMonoImage([
    '###',
    '#.#',
    '###'
  ]);

  const bounds = floodFillBounds(image, 0, 0, 3);

  test.deepEqual(bounds, { x1: 0, y1: 0, x2: 3, y2: 3 }, 'Bounds clamped to image dimensions');
  test.end();
});

test('floodFillBounds:concave_region_uses_extent_not_just_visited', function (test) {
  // The donut shape's bounding box covers the entire 5x5 ring, including
  // the hollow centre — the box is the extent of the visited pixels, not
  // the set of them.
  const image = makeMonoImage([
    '#####',
    '#...#',
    '#...#',
    '#...#',
    '#####'
  ]);

  const bounds = floodFillBounds(image, 0, 0, 0);

  test.deepEqual(bounds, { x1: 0, y1: 0, x2: 4, y2: 4 }, 'Bounding box spans the whole ring');
  test.end();
});

test('floodFillBounds:single_pixel_region_returns_null', function (test) {
  // A lone '#' fills exactly one cell, so x1===x2 and y1===y2 — the
  // function treats a zero-area box as no region and returns null.
  const image = makeMonoImage([
    '...',
    '.#.',
    '...'
  ]);

  const bounds = floodFillBounds(image, 1, 1, 1);

  test.equal(bounds, null, 'Single-pixel region yields null');
  test.end();
});

test('floodFillBounds:seed_on_zero_bit_returns_null', function (test) {
  // Seed on a '.' cell makes floodFill terminate immediately without any
  // callbacks. x1/x2/y1/y2 stay at the seed coords, so x1===x2 — null.
  const image = makeMonoImage([
    '#####',
    '#...#',
    '#...#',
    '#...#',
    '#####'
  ]);

  const bounds = floodFillBounds(image, 2, 2, 1);

  test.equal(bounds, null, 'No callbacks → zero-sized box → null');
  test.end();
});

test('floodFillBounds:single_row_region_returns_null', function (test) {
  // A region one pixel tall has y1===y2 even though it spans multiple
  // columns — the early-return treats it as zero-sized.
  const image = makeMonoImage([
    '.....',
    '.###.',
    '.....'
  ]);

  const bounds = floodFillBounds(image, 2, 1, 0);

  test.equal(bounds, null, 'Single-row region yields null');
  test.end();
});

test('floodFillBounds:single_column_region_returns_null', function (test) {
  // Mirror of the single-row case: a 1-wide vertical strip has x1===x2.
  const image = makeMonoImage([
    '...',
    '.#.',
    '.#.',
    '.#.',
    '...'
  ]);

  const bounds = floodFillBounds(image, 1, 2, 0);

  test.equal(bounds, null, 'Single-column region yields null');
  test.end();
});

test('floodFillBounds:asymmetric_border_clamp', function (test) {
  // Region hugs the left/top edges but has room on the right/bottom. With
  // border=2, x1/y1 clamp to 0 while x2/y2 expand freely.
  const image = makeMonoImage([
    '##....',
    '##....',
    '......',
    '......',
    '......'
  ]);

  const bounds = floodFillBounds(image, 0, 0, 2);

  test.deepEqual(bounds, { x1: 0, y1: 0, x2: 3, y2: 3 }, 'Left/top clamped, right/bottom grown');
  test.end();
});

// Like makeMonoImage, but each cell's full 8-bit value is given as a number
// in the row arrays — bit 0 is the threshold result, bits 7..1 are the
// (already-quantised) luminance. Used to exercise floodFillHistogram against
// varied luminance values, where the ASCII helper would only ever produce a
// single value (0x80).
function makeMonoImageRaw (rows) {
  const height = rows.length;
  const width = rows[0].length;
  const mono = new Uint8ClampedArray(width * height);
  mono.phWidth = width;
  mono.phHeight = height;
  for (let y = 0; y < height; y += 1) {
    if (rows[y].length !== width) throw new Error('ragged row in test image');
    for (let x = 0; x < width; x += 1) {
      mono[y * width + x] = rows[y][x];
    }
  }
  return mono;
}

test('floodFillHistogram:counts_match_visited_pixels', function (test) {
  // The histogram's total mass must equal the number of visited pixels — i.e.
  // it covers exactly the connected region the fill walked, no more, no less.
  // makeMonoImage stamps a uniform luminance of 0x80 on every cell, so a 3x3
  // foreground block contributes 9 hits to histogram[0x80].
  const image = makeMonoImage([
    '.....',
    '.###.',
    '.###.',
    '.###.',
    '.....'
  ]);

  const histogram = floodFillHistogram(image, 2, 2);

  let total = 0;
  for (let i = 0; i < histogram.length; i += 1) total += histogram[i];
  test.equal(total, 9, 'Total histogram mass equals the 9 visited foreground pixels');
  test.equal(histogram[0x80], 9, 'All 9 cells fall into the 0x80 luminance bin');
  test.end();
});

test('floodFillHistogram:background_seed_picks_up_background_region', function (test) {
  // refVal is left undefined, so the seed's own bit 0 decides which side of
  // the threshold the fill targets. Seeding on a '.' cell inside the hollow
  // centre must therefore tally the 9 background cells, NOT the surrounding
  // foreground frame.
  const image = makeMonoImage([
    '#####',
    '#...#',
    '#...#',
    '#...#',
    '#####'
  ]);

  const histogram = floodFillHistogram(image, 2, 2);

  let total = 0;
  for (let i = 0; i < histogram.length; i += 1) total += histogram[i];
  test.equal(total, 9, 'Histogram covers the 9-cell background region');
  test.equal(histogram[0x80], 9, 'Background cells land in the 0x80 bin (frame excluded)');
  test.end();
});

test('floodFillHistogram:bins_by_luminance_with_bit_zero_masked', function (test) {
  // Mixed luminance across a connected foreground region. Each cell's bit 0
  // is set (so the fill walks all 4), and bits 7..1 hold three different
  // quantised luminances: 0x40, 0x80, and 0xC0. The histogram must place each
  // pixel in the bin keyed by `value & 0xFE`, so odd-index slots stay zero.
  const image = makeMonoImageRaw([
    [0x41, 0x81, 0x00, 0x00],
    [0xC1, 0x81, 0x00, 0x00]
  ]);

  const histogram = floodFillHistogram(image, 0, 0);

  test.equal(histogram[0x40], 1, 'One pixel with luminance 0x40');
  test.equal(histogram[0x80], 2, 'Two pixels with luminance 0x80');
  test.equal(histogram[0xC0], 1, 'One pixel with luminance 0xC0');

  let oddTotal = 0;
  for (let i = 1; i < histogram.length; i += 2) oddTotal += histogram[i];
  test.equal(oddTotal, 0, 'Odd-index bins are never written — bit 0 is masked off');
  test.end();
});

test('floodFillHistogram:only_tallies_connected_component', function (test) {
  // Two foreground regions separated by a background gap. Seeding inside the
  // left region must only count its cells; the right region's pixels — even
  // though they share the same luminance — must NOT appear in the histogram.
  const image = makeMonoImage([
    '##.##',
    '##.##',
    '##.##'
  ]);

  const histogram = floodFillHistogram(image, 0, 1);

  let total = 0;
  for (let i = 0; i < histogram.length; i += 1) total += histogram[i];
  test.equal(total, 6, 'Only the 6 left-region cells contribute');
  test.equal(histogram[0x80], 6, 'All 6 land in the 0x80 bin');
  test.end();
});

test('floodFillHistogram:fractional_seed_is_floored', function (test) {
  // Viewer passes a focal point in image space, which can be fractional. The
  // function must floor refX/refY internally so callers don't need to.
  // (2.9, 2.9) floors to (2, 2), which lies inside the 3x3 block; (1.0, 1.0)
  // also lies inside the block, so the two calls must produce identical
  // histograms.
  const image = makeMonoImage([
    '.....',
    '.###.',
    '.###.',
    '.###.',
    '.....'
  ]);

  const fractional = floodFillHistogram(image, 2.9, 2.9);
  const integer = floodFillHistogram(image, 2, 2);

  test.deepEqual(
    Array.from(fractional),
    Array.from(integer),
    'Fractional and integer seeds inside the same cell give the same histogram'
  );
  test.end();
});

test('floodFillHistogram:seed_outside_image_returns_null', function (test) {
  // The only way floodFill produces zero callbacks with refVal=undefined is a
  // seed whose Inside check fails on bounds — i.e. it lies outside
  // [0, phWidth) × [0, phHeight). The histogram has no meaningful content in
  // that case, so the function returns null rather than an all-zero buffer.
  const image = makeMonoImage([
    '###',
    '###',
    '###'
  ]);

  test.equal(floodFillHistogram(image, -1, 0), null, 'Seed left of image → null');
  test.equal(floodFillHistogram(image, 3, 0), null, 'Seed right of image → null');
  test.equal(floodFillHistogram(image, 0, -1), null, 'Seed above image → null');
  test.equal(floodFillHistogram(image, 0, 3), null, 'Seed below image → null');
  test.end();
});

test('floodFillHistogram:in_bounds_seed_always_returns_a_histogram', function (test) {
  // With refVal=undefined the seed's own bit becomes the target, so any
  // in-bounds seed satisfies Inside and produces at least one callback. The
  // background-cell seed proves this for the '.' side; the foreground seed
  // proves it for the '#' side. Both must yield a non-null histogram whose
  // mass equals the size of the connected component the seed sits in.
  const image = makeMonoImage([
    '#####',
    '#...#',
    '#####'
  ]);

  const fromBackground = floodFillHistogram(image, 2, 1);
  const fromForeground = floodFillHistogram(image, 0, 0);

  test.ok(fromBackground, 'Background seed yields a histogram');
  test.ok(fromForeground, 'Foreground seed yields a histogram');

  let bgTotal = 0;
  for (let i = 0; i < fromBackground.length; i += 1) bgTotal += fromBackground[i];
  let fgTotal = 0;
  for (let i = 0; i < fromForeground.length; i += 1) fgTotal += fromForeground[i];
  test.equal(bgTotal, 3, 'Background region has 3 cells');
  test.equal(fgTotal, 12, 'Foreground region has 12 cells (15 total - 3 background)');
  test.end();
});

test('floodFill:each_pixel_visited_once_on_blob', function (test) {
  // A symmetric blob exercises the span algorithm's "leak-back" bookkeeping
  // (the y - dy spans pushed when the leftward scan extends past x1, and
  // when the rightward scan extends past x2). Every cell in the connected
  // component should be visited exactly once.
  const image = makeMonoImage([
    '..##..',
    '.####.',
    '######',
    '######',
    '.####.',
    '..##..'
  ]);

  const visited = collectFilled(image, 3, 3, 1);
  const coords = new Set(visited.map((v) => v.x + ',' + v.y));

  // Row tallies: 2 + 4 + 6 + 6 + 4 + 2 = 24
  test.equal(visited.length, 24, '24 callback invocations');
  test.equal(coords.size, 24, 'Each of the 24 # pixels visited exactly once');
  test.notOk(coords.has('0,0'), 'Off-blob corner not visited');
  test.notOk(coords.has('5,5'), 'Off-blob corner not visited');
  test.end();
});
