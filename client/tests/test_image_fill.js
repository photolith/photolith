import test from 'tape';

import { floodFill } from '../src/image/fill.js';

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
// failing test into a hang.
function collectFilled (image, refX, refY) {
  const visited = [];
  floodFill(image, refX, refY, (x, y, lum) => {
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

  const visited = collectFilled(image, 1, 1);

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

  const visited = collectFilled(image, 2, 2);
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

  const visited = collectFilled(image, 0, 0);

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

  const visited = collectFilled(image, 0, 0);
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

  const visited = collectFilled(image, 0, 1);
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

  const visited = collectFilled(image, 0, 0);
  const coords = new Set(visited.map((v) => v.x + ',' + v.y));

  test.equal(visited.length, 8, 'All 8 boundary cells visited, centre skipped');
  test.equal(coords.size, 8, 'Each boundary cell visited exactly once');
  test.notOk(coords.has('1,1'), 'Centre (.) not visited');
  test.end();
});

test('floodFill:seed_on_zero_bit_is_noop', function (test) {
  // Inside is defined as bit 0 == 1, regardless of the seed pixel. Seeding
  // on a '.' cell makes the seed itself fail Inside, so the fill terminates
  // immediately with no callbacks — even if there are reachable '#' pixels
  // nearby.
  const image = makeMonoImage([
    '#####',
    '#...#',
    '#...#',
    '#...#',
    '#####'
  ]);

  const visited = collectFilled(image, 2, 2);

  test.equal(visited.length, 0, 'No pixels visited when seed has bit 0 = 0');
  test.end();
});

test('floodFill:seed_on_zero_bit_then_set_pixel_still_noop', function (test) {
  // Even seeding on a '.' immediately adjacent to a '#' pixel must not leak
  // into the '#' region: the seed's Inside check fails, so no spans are
  // ever enqueued.
  const image = makeMonoImage([
    '.###',
    '.###',
    '.###'
  ]);

  const visited = collectFilled(image, 0, 1);

  test.equal(visited.length, 0, 'Seed bit determines termination, not neighbours');
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

  const visited = collectFilled(image, 3, 3);
  const coords = new Set(visited.map((v) => v.x + ',' + v.y));

  // Row tallies: 2 + 4 + 6 + 6 + 4 + 2 = 24
  test.equal(visited.length, 24, '24 callback invocations');
  test.equal(coords.size, 24, 'Each of the 24 # pixels visited exactly once');
  test.notOk(coords.has('0,0'), 'Off-blob corner not visited');
  test.notOk(coords.has('5,5'), 'Off-blob corner not visited');
  test.end();
});
