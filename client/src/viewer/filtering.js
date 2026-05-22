import { filters, config, getEnv } from 'fabric';

import { PhViewer } from './base';
import { changeEvent } from '../events';
import { thresholdLocalOtsu, normaliseSelection } from '../image/threshold.js';
import { floodFillHistogram, fullHistogram } from '../image/fill.js';
import { HistogramExpansion } from '../fabric/filter_histogramexpansion.js';
import { ThresholdImage } from '../fabric/filter_thresholdimage.js';

export class PhFilteringViewer extends PhViewer {
  constructor (elViewer) {
    // Push textureSize up to the GPU's max BEFORE the filter backend is
    // lazily created — once WebGLFilterBackend exists, its internal canvas is
    // locked at config.textureSize, so a smaller backing canvas would clip
    // filter output for any image larger than the default 4096px.
    const { WebGLProbe } = getEnv();
    WebGLProbe.queryWebGL(document.createElement('canvas'));
    if (WebGLProbe.maxTextureSize) {
      config.textureSize = WebGLProbe.maxTextureSize;
    }

    super(elViewer);
    this.elForm = this.elViewer.querySelector(':scope form');
    this.elForm.onchange = (event) => {
      // Serialise attempts to alter filters
      if (!this.filterActiveTimeout) {
        this.filterActiveTimeout = setTimeout(this.refreshFilters.bind(this), 0);
      }
    };
    // oninput fires as range sliders are dragged, not just when let go
    this.elForm.oninput = this.elForm.onchange;
    this.elForm.onreset = this.elForm.onchange;
  }

  refreshFilters () {
    const img = this.fabCanvas.backgroundImage;
    const phFilters = Object.fromEntries(new FormData(this.elForm));

    if (!img) {
      this.filterActiveTimeout = undefined;
      return; // No image loaded
    }

    // Check if filters actually changed
    if (phFilters.histogramExpansion && phFilters.histogramExpansion !== '0') {
      phFilters._focalPoint = this._focalPoint;
    }
    if (JSON.stringify(phFilters) === this._prevPhFilters) {
      // Filters didn't change
      this.filterActiveTimeout = undefined;
      return;
    }
    this._prevPhFilters = phFilters;

    img.filters = [];

    if (phFilters.brightness && phFilters.brightness !== '0') {
      img.filters.push(new filters.Brightness({
        brightness: parseFloat(phFilters.brightness)
      }));
    }

    if (phFilters.contrast && phFilters.contrast !== '0') {
      img.filters.push(new filters.Contrast({
        contrast: parseFloat(phFilters.contrast)
      }));
    }

    if (phFilters.gamma && phFilters.gamma !== '1') {
      phFilters.gamma = parseFloat(phFilters.gamma);
      img.filters.push(new filters.Gamma({
        gamma: [
          phFilters.gamma,
          phFilters.gamma,
          phFilters.gamma
        ]
      }));
    }

    if (phFilters.saturation && phFilters.saturation !== '0') {
      if (phFilters.saturationhue && phFilters.saturationhue !== '0') {
        // https://fabricjs.com/api/namespaces/filters/classes/blendcolor/
        img.filters.push(new filters.BlendColor({
          color: 'hsl(' + Math.floor(parseFloat(phFilters.saturationhue) * 360) + ',100%,50%)',
          alpha: Math.abs(phFilters.saturation),
          mode: phFilters.saturation > 1 ? 'add' : 'subtract'
        }));
      } else {
        // Saturate / desaturate all colours
        img.filters.push(new filters.Saturation({
          saturation: parseFloat(phFilters.saturation)
        }));
      }
    }

    if (phFilters.vibrance && phFilters.vibrance !== '0') {
      img.filters.push(new filters.Vibrance({
        vibrance: parseFloat(phFilters.vibrance)
      }));
    }

    if (phFilters.histogramExpansion && phFilters.histogramExpansion !== '0') {
      const [image, rescale] = this.thresholdedImage();
      // If no focal point, or focal point out of bounds, use full image histogram
      const histogram = (this._focalPoint
        ? floodFillHistogram(
          image,
          Math.floor(this._focalPoint.x * rescale),
          Math.floor(this._focalPoint.y * rescale)
        )
        : null) || fullHistogram(image);

      img.filters.push(new HistogramExpansion({
        histogramExpansion: parseFloat(phFilters.histogramExpansion),
        histogram
      }));
    }

    if (phFilters.laplace) {
      img.filters.push(new filters.Convolute({
        matrix: [
          -1, -1, -1,
          -1, 8, -1,
          -1, -1, -1
        ]
      }));
    }

    if (phFilters.thresholdImage) {
      const [image] = this.thresholdedImage();
      img.filters.push(new ThresholdImage({
        image
      }));
    }

    const applyFilters = () => {
      try {
        img.applyFilters();
        this.filterActiveTimeout = undefined;
      } catch (err) {
        this.filterActiveTimeout = undefined;
        console.error(err);
        this.elForm.reset();
        throw new Error('Could not apply image filter, GPU out of memory(?)');
      }
      this.fabCanvas.renderAll();
    };

    if (!this.phFiltersApplied && img.filters.length > 0) {
      // First attempt likely to take a while, as we copy to GPU
      this.startRendering();
      window.setTimeout(applyFilters, 10);
      this.phFiltersApplied = true;
    } else {
      // No filters / already in GPU, just do it
      applyFilters();
    }
  }

  load (blob, boundingBox) {
    return super.load(blob, boundingBox).finally(() => {
      // Pre-cache thresholded version of image
      if (this.fabCanvas.backgroundImage) {
        this.thresholdedImage();
      }
      // Clear focal point on new image load
      this.setFocalPoint(null);
    });
  }

  // Set focal pixels as used by filters (e.g. currently selected individual)
  setFocalPoint (x, y) {
    const oldFp = this._focalPoint || null;
    this._focalPoint = x === null ? null : { x, y };
    // Trigger filters to update based on new focal point
    if (x === null ? oldFp !== null : (oldFp === null || oldFp.x !== x || oldFp.y !== y)) {
      this.elForm.dispatchEvent(changeEvent());
    }
  }

  lowresImage () {
    const bkgdImg = this.fabCanvas.backgroundImage;

    // Reduce resolution of our working offscreen image to ~1000px wide
    const rescale = bkgdImg._originalElement.width > 1000 ? 1 / Math.round(bkgdImg._originalElement.width / 1000) : 1;

    let context = null;
    if (!bkgdImg.phOffScreen) {
      // Attach canvas to FabricImage, so it gets thrown away when background changes
      bkgdImg.phOffScreen = new window.OffscreenCanvas(
        bkgdImg._originalElement.width * rescale,
        bkgdImg._originalElement.height * rescale
      );
      context = bkgdImg.phOffScreen.getContext('2d', { willReadFrequently: true });
      context.drawImage(bkgdImg._originalElement, 0, 0, bkgdImg.phOffScreen.width, bkgdImg.phOffScreen.height);
    } else {
      // Already got one, just open context
      context = bkgdImg.phOffScreen.getContext('2d', { willReadFrequently: true });
    }
    return [context, rescale];
  }

  thresholdedImage () {
    const bkgdImg = this.fabCanvas.backgroundImage;

    // Draw background image onto offscreen canvas, get 2d context to read
    const [context, rescale] = this.lowresImage();

    // Generate monochrome thresholded vesion if not already present
    if (!bkgdImg.phThresholded) {
      bkgdImg.phThresholded = normaliseSelection(thresholdLocalOtsu(
        context.getImageData(0, 0, context.canvas.width, context.canvas.height, { colorSpace: 'srgb' }),
        // i.e. ~55 pixels
        Math.floor(context.canvas.width * 0.053),
        // sigmaDivisor 1.0 gets flatter results with smaller images, e.g. homepage image
        1.0
      ));
      // document.body.append(debugPreview(bkgdImg.phThresholded));
    }
    return [bkgdImg.phThresholded, rescale];
  }
}
