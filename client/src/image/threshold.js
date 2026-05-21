/**
 * Convert an RGBA ImageData to monochrome and apply Otsu's binary threshold.
 *
 * Each output byte carries two pieces of information packed together:
 *   - bits 7..1: the 8-bit luminance of the pixel (with bit 0 masked off,
 *     so 1 bit of grayscale precision is sacrificed)
 *   - bit 0:     1 if the pixel is above the Otsu threshold, 0 otherwise
 *
 * The threshold itself is chosen by Otsu's method: the histogram split that
 * maximises the between-class variance of foreground and background pixels.
 * This is a direct port of scikit-image's `threshold_otsu`, specialised for
 * an 8-bit image (256 fixed integer bins, so bin index == intensity value).
 *
 * @param {ImageData} imageData - Source image. Only the RGB channels are read;
 *   alpha is ignored. `width * height` must equal `data.length / 4`.
 * @returns {Uint8ClampedArray} A `width * height` array of packed
 *   luminance/threshold bytes (see bit layout above).
 * @see https://scikit-image.org/docs/stable/api/skimage.filters.html#skimage.filters.threshold_otsu
 */
export function thresholdOtsu (imageData) {
  const { data, width, height } = imageData;
  const n = width * height;
  const mono = new Uint8ClampedArray(n);
  mono.phWidth = width;
  mono.phHeight = height;
  const hist = new Uint32Array(256);

  // Pass 1: walk every pixel in the RGBA buffer (stride 4), collapse it to an
  // 8-bit luminance using the Rec. 601 coefficients, store it in `mono`, and
  // tally the value into the 256-bin intensity histogram used by Otsu below.
  for (let i = 0; i < n; i += 1) {
    const j = i * 4;
    const g = (0.299 * data[j] + 0.587 * data[j + 1] + 0.114 * data[j + 2]) | 0;
    mono[i] = g;
    hist[g] += 1;
  }

  // Pass 2: build two cumulative arrays over the histogram, scanning bins
  // 0..255 left-to-right. `w1[t]` is the pixel count of class 1 (intensities
  // <= t) — i.e. scikit-image's `weight1`. `cs[t]` is the cumulative weighted
  // sum `Σ i * hist[i]` for i <= t, which lets us derive the class means in
  // O(1) per candidate threshold rather than re-scanning the histogram each
  // time. `totalW` / `totalS` end up as the grand totals, used to recover the
  // class-2 weight and sum by subtraction.
  const w1 = new Float64Array(256);
  const cs = new Float64Array(256);
  let totalW = 0;
  let totalS = 0;
  for (let i = 0; i < 256; i += 1) {
    totalW += hist[i];
    totalS += i * hist[i];
    w1[i] = totalW;
    cs[i] = totalS;
  }

  // Pass 3: try every possible split point t and keep the one with the largest
  // between-class variance `w1 * w2 * (m1 - m2)^2`. Indices t in [0, 254]
  // correspond to scikit-image's `variance12 = weight1[:-1] * weight2[1:] *
  // (mean1[:-1] - mean2[1:])^2` — class 1 covers intensities <= t, class 2
  // covers > t. Splits where either class is empty are skipped to avoid
  // dividing by zero when computing means.
  let bestVar = -1;
  let threshold = 0;
  for (let t = 0; t < 255; t += 1) {
    const w1t = w1[t];
    const w2t = totalW - w1t;
    if (w1t === 0 || w2t === 0) continue;
    const m1 = cs[t] / w1t;
    const m2 = (totalS - cs[t]) / w2t;
    const v = w1t * w2t * (m1 - m2) * (m1 - m2);
    if (v > bestVar) {
      bestVar = v;
      threshold = t;
    }
  }

  // Pass 4: pack the binary thresholding result into the least significant bit
  // of each luminance byte. We compare the *original* gray value against the
  // threshold, then mask off bit 0 (`& 0xFE`) and OR in the comparison result
  // so the upper 7 bits still carry a (slightly quantised) grayscale image.
  for (let i = 0; i < n; i += 1) {
    mono[i] = (mono[i] & 0xFE) | (mono[i] > threshold ? 1 : 0);
  }

  return mono;
}

/**
 * Convert an RGBA ImageData to monochrome and apply an adaptive threshold
 * based on the local Gaussian-weighted mean of each pixel's neighbourhood.
 * Output layout matches `thresholdOtsu`: 7 bits of (quantised) luminance in
 * the upper bits, plus the binary threshold result in bit 0.
 *
 * Port of scikit-image's `threshold_local` with the default `method='gaussian'`,
 * `offset=0`, `mode='reflect'`, `param=None`. The Gaussian sigma is derived
 * as `(blockSize - 1) / 6`, the same automatic choice scikit-image makes
 * when `param` is unset.
 *
 * @param {ImageData} imageData - Source image, same contract as `thresholdOtsu`.
 * @param {number} [blockSize] - Neighbourhood size in pixels. Forced odd
 *   and clamped to >= 3 (scikit-image requires odd neighbourhood sizes).
 *   Defaults to 10% of image width, rounded down.
 * @returns {Uint8ClampedArray} A `width * height` array of packed
 *   luminance/threshold bytes (see `thresholdOtsu` for the bit layout).
 * @see https://scikit-image.org/docs/stable/api/skimage.filters.html#skimage.filters.threshold_local
 */
export function thresholdLocalOtsu (imageData, blockSize) {
  const { data, width, height } = imageData;
  const n = width * height;
  const mono = new Uint8ClampedArray(n);
  mono.phWidth = width;
  mono.phHeight = height;

  // Pass 1: Rec. 709 luminance (matching skimage.color.rgb2gray), kept twice
  // — as the packed 8-bit `mono` we'll ultimately return (Uint8ClampedArray
  // rounds on store), and as a Float64 `gray` buffer that the separable
  // Gaussian convolution operates on at full precision.
  const gray = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    const j = i * 4;
    const g = 0.2125 * data[j] + 0.7154 * data[j + 1] + 0.0721 * data[j + 2];
    mono[i] = g;
    gray[i] = g;
  }

  if (blockSize === undefined) blockSize = Math.floor(width * 0.1);
  if (blockSize < 3) blockSize = 3;
  if (blockSize % 2 === 0) blockSize += 1;
  const sigma = (blockSize - 1) / 6.0;

  // 1D Gaussian kernel, truncated at 4σ to match scipy.ndimage's default.
  // The 2D filter is the outer product of this kernel with itself; we apply
  // it as two 1D passes (horizontal then vertical) to keep the work O(n·r).
  const truncate = 4.0;
  const radius = Math.max(1, Math.floor(truncate * sigma + 0.5));
  const kernelSize = 2 * radius + 1;
  const kernel = new Float64Array(kernelSize);
  const twoSigmaSq = 2 * sigma * sigma;
  let kSum = 0;
  for (let k = -radius; k <= radius; k += 1) {
    const v = Math.exp(-(k * k) / twoSigmaSq);
    kernel[k + radius] = v;
    kSum += v;
  }
  for (let k = 0; k < kernelSize; k += 1) kernel[k] /= kSum;

  // Horizontal pass (gray → tmp). Out-of-range columns use scipy's 'reflect'
  // mode: indices fold about the outer edge of the last pixel, so x=-1 maps
  // to x=0, x=width maps to x=width-1, and so on. The `while` handles the
  // (rare, for small images) case where the kernel reaches past both edges.
  const tmp = new Float64Array(n);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * width;
    for (let x = 0; x < width; x += 1) {
      let v = 0;
      for (let k = -radius; k <= radius; k += 1) {
        let xi = x + k;
        while (xi < 0 || xi >= width) {
          if (xi < 0) xi = -1 - xi;
          else xi = 2 * width - 1 - xi;
        }
        v += gray[rowStart + xi] * kernel[k + radius];
      }
      tmp[rowStart + x] = v;
    }
  }

  // Vertical pass (tmp → thresh). Same reflect logic on the y axis.
  const thresh = new Float64Array(n);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let v = 0;
      for (let k = -radius; k <= radius; k += 1) {
        let yi = y + k;
        while (yi < 0 || yi >= height) {
          if (yi < 0) yi = -1 - yi;
          else yi = 2 * height - 1 - yi;
        }
        v += tmp[yi * width + x] * kernel[k + radius];
      }
      thresh[y * width + x] = v;
    }
  }

  // Pack: compare original gray to the per-pixel local threshold and stash
  // the result in bit 0
  for (let i = 0; i < n; i += 1) {
    mono[i] = (mono[i] & 0xFE) | (gray[i] > thresh[i] ? 1 : 0);
  }

  return mono;
}

/**
 * Ensure the binary threshold bit treats 0 as the majority class, so we can
 * assume that the background is 0, and foreground is 1.
 * If 1s outnumer 0s in mono, flip the LSB so the foreground is 1 again.
 *
 * @param {Uint8ClampedArray} mono - Output of `thresholdOtsu` /
 *   `thresholdLocalOtsu`. Modified in place.
 * @returns {Uint8ClampedArray} The same array, for chaining.
 */
export function normaliseSelection (mono) {
  let ones = 0;
  for (let i = 0; i < mono.length; i += 1) ones += mono[i] & 1;
  if (ones * 2 > mono.length) {
    for (let i = 0; i < mono.length; i += 1) mono[i] ^= 1;
  }
  return mono;
}

/**
 * Return a canvas displaying the thresholded image for debugging
 *
 * @param {Uint8ClampedArray} mono - Output of `thresholdOtsu`. Must carry
 *   `phWidth` / `phHeight`, which together describe the image layout in the
 *   flat array (index = y * phWidth + x).
 * @return HTML canvas element
 */
export function debugPreview (image) {
  const c = window.document.createElement('canvas');
  c.width = image.phWidth;
  c.height = image.phHeight;
  const width = image.phWidth;

  const rgba = new Uint8ClampedArray(image.length * 4);
  image.forEach((v, i) => {
    rgba[i * 4] = v;
    rgba[i * 4 + 1] = v;
    rgba[i * 4 + 2] = v;
    rgba[i * 4 + 3] = (v & 0x01) * 255;
  });
  c.getContext('2d').putImageData(new window.ImageData(rgba, width), 0, 0);
  return c;
}

/**
 * Iterate over the pixels of an `thresholdOtsu` output within an axis-aligned
 * rectangle. The rectangle is closed: `x1 <= x <= x2`, `y1 <= y <= y2`.
 *
 * Row stride is taken from `mono.phWidth` (set by `thresholdOtsu`), and the
 * rectangle is clamped to `[0, phWidth - 1] × [0, phHeight - 1]` so callers
 * don't have to pre-check their bounds when iterating near image edges.
 *
 * @param {Uint8ClampedArray} mono - Output of `thresholdOtsu`. Must carry
 *   `phWidth` / `phHeight`, which together describe the image layout in the
 *   flat array (index = y * phWidth + x).
 * @param {number} x1 - Left column, inclusive.
 * @param {number} y1 - Top row, inclusive.
 * @param {number} x2 - Right column, inclusive.
 * @param {number} y2 - Bottom row, inclusive.
 * @yields {number} The packed luminance/threshold byte for each pixel.
 *   Callers can recover the grayscale value with `value & 0xFE` and the
 *   binary threshold result with `value & 1`.
 */
export function * iterPixelsInRect (mono, x1, y1, x2, y2) {
  const { phWidth, phHeight } = mono;
  const xStart = Math.max(x1, 0);
  const yStart = Math.max(y1, 0);
  const xEnd = Math.min(x2, phWidth - 1);
  const yEnd = Math.min(y2, phHeight - 1);
  for (let y = yStart; y <= yEnd; y += 1) {
    const rowStart = y * phWidth;
    for (let x = xStart; x <= xEnd; x += 1) {
      yield mono[rowStart + x];
    }
  }
}
