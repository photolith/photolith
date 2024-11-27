import { fabric } from 'fabric';

import { PhViewer } from './base';

export class PhFilteringViewer extends PhViewer {
  constructor (elViewer) {
    if (fabric.isWebglSupported()) {
      // Increase textureSize to limit, so our images hopefully fit
      fabric.textureSize = fabric.maxTextureSize;
    }

    super(elViewer);
    this.elForm = this.elViewer.querySelector(':scope form');
    this.elForm.onchange = (event) => {
      if (this.formChangeTimeout) clearTimeout(this.formChangeTimeout);
      this.formChangeTimeout = setTimeout(this.refreshFilters.bind(this), 600);
    };
    this.elForm.onreset = (event) => {
      if (this.formChangeTimeout) clearTimeout(this.formChangeTimeout);
      this.formChangeTimeout = setTimeout(this.refreshFilters.bind(this), 10);
    };
  }

  refreshFilters () {
    const img = this.fabCanvas.backgroundImage;
    const phFilters = Object.fromEntries(new FormData(this.elForm));

    if (!img) return; // No image loaded
    img.filters = [];

    if (phFilters.brightness && phFilters.brightness !== '0') {
      img.filters.push(new fabric.Image.filters.Brightness({
        brightness: parseFloat(phFilters.brightness)
      }));
    }

    if (phFilters.contrast && phFilters.contrast !== '0') {
      img.filters.push(new fabric.Image.filters.Contrast({
        contrast: parseFloat(phFilters.contrast)
      }));
    }

    if (phFilters.gamma && phFilters.gamma !== '1') {
      phFilters.gamma = parseFloat(phFilters.gamma);
      img.filters.push(new fabric.Image.filters.Gamma({
        gamma: [
          phFilters.gamma,
          phFilters.gamma,
          phFilters.gamma
        ]
      }));
    }

    if (phFilters.saturation && phFilters.saturation !== '0') {
      img.filters.push(new fabric.Image.filters.Saturation({
        saturation: parseFloat(phFilters.saturation)
      }));
    }

    if (phFilters.huesubtract && phFilters.huesubtract !== '0') {
      img.filters.push(new fabric.Image.filters.BlendColor({
        color: 'hsl(' + Math.floor(parseFloat(phFilters.huesubtract) * 360) + ',100%,50%)',
        mode: 'subtract'
      }));
    }

    if (phFilters.vibrance && phFilters.vibrance !== '0') {
      img.filters.push(new fabric.Image.filters.Vibrance({
        vibrance: parseFloat(phFilters.vibrance)
      }));
    }

    if (phFilters.laplace) {
      img.filters.push(new fabric.Image.filters.Convolute({
        matrix: [
          -1, -1, -1,
          -1, 8, -1,
          -1, -1, -1
        ]
      }));
    }

    this.startRendering();
    window.setTimeout(() => {
      try {
        img.applyFilters();
      } catch (err) {
        console.error(err);
        this.elForm.reset();
        setTimeout(this.refreshFilters.bind(this), 600);
        throw new Error('Could not apply image filter, GPU out of memory(?)');
      }
      this.fabCanvas.renderAll();
    }, 10);
  }
}
