/**
 * Span-fill (4-connected) over a `thresholdOtsu`-shaped mono image. Visits
 * every pixel reachable from (refX, refY) whose bit 0 is set, invoking
 * `callback` on each one in fill order. The seed pixel's own value does not
 * matter — if its bit 0 is 0 the fill terminates immediately, since the seed
 * itself fails the Inside test.
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
 * @param {(x: number, y: number, lum: number) => void} callback - Called
 *   once per filled pixel. `lum` is the cell value with bit 0 masked off,
 *   i.e. the 7-bit luminance shifted into bits 7..1.
 * @see https://en.wikipedia.org/wiki/Flood_fill#Span_filling — this is a
 *   direct port of the second (Inside/Set) pseudo-code algorithm.
 */
export function floodFill (image, refX, refY, callback) {
  const width = image.phWidth;
  const height = image.phHeight;
  const visited = new Uint8Array(width * height);

  function inside (x, y) {
    if (x < 0 || x >= width || y < 0 || y >= height) return false;
    const i = y * width + x;
    if (visited[i]) return false;
    return (image[i] & 0x1) === 1;
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
