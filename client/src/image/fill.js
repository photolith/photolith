/**
 * Span-fill (4-connected) over a `thresholdOtsu`-shaped mono image. Visits
 * every pixel reachable from (refX, refY) whose bit 0 equals `refVal`,
 * invoking `callback` on each one in fill order.
 *
 * Visited cells are tracked in an internal bitmap, so `image` is treated as
 * read-only and the callback has no marking responsibility — it just gets
 * told which pixels were reached.
 *
 * Pixels outside `[0, phWidth) × [0, phHeight)` are treated as not-Inside,
 * so it is safe to start the fill anywhere within the image (including
 * against the edges) without pre-clamping.
 *
 * @param {Uint8ClampedArray} image - Output of `thresholdOtsu`, carrying
 *   `phWidth` / `phHeight`. Index layout is `y * phWidth + x`. Bit 0 of
 *   each cell is the threshold result; bits 7..1 are the (quantised)
 *   luminance.
 * @param {number} refX - Column of the seed pixel (0-based).
 * @param {number} refY - Row of the seed pixel (0-based).
 * @param {0 | 1 | undefined} refVal - Threshold bit value the fill targets.
 *   `1` selects foreground, `0` selects background, `undefined` defers to
 *   the seed pixel's own bit 0.
 * @param {(x: number, y: number, lum: number) => void} callback - Called
 *   once per filled pixel. `lum` is the cell value with bit 0 masked off,
 *   i.e. the 7-bit luminance shifted into bits 7..1.
 * @see https://en.wikipedia.org/wiki/Flood_fill#Span_filling — this is a
 *   direct port of the second (Inside/Set) pseudo-code algorithm.
 */
export function floodFill (image, refX, refY, refVal, callback) {
  const width = image.phWidth;
  const height = image.phHeight;
  const visited = new Uint8Array(width * height);
  if (refVal === undefined) refVal = (refX < 0 || refX >= width || refY < 0 || refY >= height) ? 0x0 : (image[refY * width + refX] & 0x1);

  function inside (x, y) {
    if (x < 0 || x >= width || y < 0 || y >= height) return false;
    const i = y * width + x;
    if (visited[i]) return false;
    return (image[i] & 0x1) === refVal;
  }

  function set (x, y) {
    const i = y * width + x;
    visited[i] = 1;
    callback(x, y, image[i] & 0xFE);
  }

  if (!inside(refX, refY)) return;

  const stack = [[refX, refX, refY, 1], [refX, refX, refY - 1, -1]];

  while (stack.length > 0) {
    let [x1, x2, y, dy] = stack.pop();
    let x = x1;

    if (inside(x, y)) {
      while (inside(x - 1, y)) {
        set(x - 1, y);
        x--;
      }
      if (x < x1) {
        stack.push([x, x1 - 1, y - dy, -dy]);
      }
    }
    while (x1 <= x2) {
      while (inside(x1, y)) {
        set(x1, y);
        x1++;
      }
      if (x1 > x) {
        stack.push([x, x1 - 1, y + dy, dy]);
      }
      if ((x1 - 1) > x2) {
        stack.push([x2 + 1, x1 - 1, y - dy, -dy]);
      }
      x1++;
      while (x1 <= x2 && !inside(x1, y)) {
        x1++;
      }
      x = x1;
    }
  }
}

/**
 * Run `floodFill` from (refX, refY) and return the axis-aligned bounding
 * box of every visited pixel, optionally grown by `border` pixels on each
 * side. The returned box is half-open on the upper edges: `x2` and `y2`
 * are clamped to `phWidth` / `phHeight` (not `phWidth - 1`), so the box
 * can be used directly as a `[x1, x2) × [y1, y2)` slice.
 *
 * Returns `null` if the connected region has zero area along either axis
 * — i.e. a single pixel, single row, or single column, or a seed pixel
 * whose bit 0 is 0 (in which case `floodFill` terminates immediately and
 * no pixels are visited). This lets callers distinguish "no usable
 * region" from a valid one-pixel-thick box.
 *
 * @param {Uint8ClampedArray} image - Output of `thresholdOtsu`, carrying
 *   `phWidth` / `phHeight`. Index layout is `y * phWidth + x`. Bit 0 of
 *   each cell is the threshold result; bits 7..1 are the (quantised)
 *   luminance.
 * @param {number} refX - Column of the seed pixel (0-based).
 * @param {number} refY - Row of the seed pixel (0-based).
 * @param {number} border - Pixels to grow the bounding box by on each
 *   side after the fill completes. Clamped to the image extents, so the
 *   returned box never escapes `[0, phWidth] × [0, phHeight]`.
 * @returns {{x1: number, y1: number, x2: number, y2: number} | null}
 *   Bounding box of the filled region (`x1`/`y1` inclusive, `x2`/`y2`
 *   exclusive when border-clamped to the image edge), or `null` if the
 *   region is degenerate along either axis.
 */
export function floodFillBounds (image, refX, refY, border) {
  let x1 = refX;
  let y1 = refY;
  let x2 = refX;
  let y2 = refY;
  // NB: refVal is always 1, so we don't select background
  floodFill(image, x1, y1, 1, function (newX, newY) {
    if (newX < x1) x1 = newX;
    if (newY < y1) y1 = newY;
    if (newX > x2) x2 = newX;
    if (newY > y2) y2 = newY;
  });

  // If bounding box is zero-sized, then don't set it
  if (x1 === x2 || y1 === y2) return null;

  // Expand bounding box a notch to include edges
  x1 = Math.max(0, x1 - border);
  y1 = Math.max(0, y1 - border);
  x2 = Math.min(image.phWidth, x2 + border);
  y2 = Math.min(image.phHeight, y2 + border);

  return { x1, y1, x2, y2 };
}

/**
 * Run `floodFill` from (refX, refY) and tally the luminance of every visited
 * pixel into a 256-entry histogram. `refVal` is left `undefined`, so the fill
 * follows whichever side of the threshold the seed lands on — foreground or
 * background — and the histogram describes the luminance distribution of that
 * connected region.
 *
 * The histogram is indexed by the `lum` value supplied by `floodFill`, which
 * is the cell with bit 0 masked off (`value & 0xFE`). Bit 0 is therefore
 * always 0 in any index that gets incremented, so only the 128 even slots
 * (0, 2, …, 254) are ever touched; the odd slots stay at zero. Callers that
 * want a packed 128-entry histogram can read `histogram[i << 1]`.
 *
 * Returns `null` when the fill visits no pixels at all — i.e. the seed lies
 * outside `[0, phWidth) × [0, phHeight)`.
 *
 * @param {Uint8ClampedArray} image - Output of `thresholdOtsu`, carrying
 *   `phWidth` / `phHeight`. Index layout is `y * phWidth + x`. Bit 0 of
 *   each cell is the threshold result; bits 7..1 are the (quantised)
 *   luminance.
 * @param {number} refX - Column of the seed pixel. Floored before use, so
 *   fractional inputs are accepted.
 * @param {number} refY - Row of the seed pixel. Floored before use.
 * @returns {Uint32Array | null} A 256-entry histogram of `value & 0xFE`
 *   counts over the connected region, or `null` if no pixels were visited.
 */
export function floodFillHistogram (image, refX, refY) {
  refX = Math.floor(refX);
  refY = Math.floor(refY);
  const histogram = new Uint32Array(256);
  let count = 0;

  // NB: Refer to reference pixel, so we also select background
  floodFill(image, refX, refY, undefined, function (newX, newY, val) {
    histogram[val]++;
    count++;
  });
  if (count === 0) return null;

  return histogram;
}

export function fullHistogram (image) {
  const histogram = new Uint32Array(256);

  for (let i = 0; i < image.length; i++) {
    histogram[image[i] & 0xFE]++;
  }

  return histogram;
}
