import { fabric } from 'fabric';
const formson = require('formson');

class PhViewer {
  constructor (elViewer) {
    this.elViewer = elViewer;
    elViewer.phViewer = this;
    this.elForm = this.elViewer.querySelector(':scope form');

    if (fabric.isWebglSupported()) {
      // TODO; fabric.maxTextureSize is 1 << 14, but setting it results in 2d fallback(?)
      fabric.textureSize = Math.max(8192, fabric.maxTextureSize);
    }

    this.fabCanvas = new fabric.Canvas(this.elViewer.querySelector(':scope > canvas.image'));
    this.fabCanvas.setWidth(this.elViewer.clientWidth);
    this.fabCanvas.setHeight(this.elViewer.clientHeight);

    this.fabCanvas.phFitViewport = function (obj) {
      const zoom = Math.min(
        this.height / obj.height,
        this.width / obj.width
      );
      this.setViewportTransform([zoom, 0, 0, zoom, (this.width - obj.width * zoom) / 2, (this.height - obj.height * zoom) / 2]);
    };

    this.fabCanvas.phLimitViewport = function () {
      const vpt = this.viewportTransform;
      const zoom = this.getZoom();
      const img = this.backgroundImage;

      // vpt: https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/transform#matrix
      // Or [zoomLevel, 0, 0, zoomLevel, newLeft, newTop]
      if (!img) {
        vpt[4] = 0;
      } else if (this.getWidth() > img.width * zoom) {
        // Image smaller than canvas, invert logic
        if (vpt[4] < 0) {
          vpt[4] = 0;
        } else if (img && vpt[4] > this.getWidth() - img.width * zoom) {
          vpt[4] = this.getWidth() - img.width * zoom;
        }
      } else if (vpt[4] > 0) {
        vpt[4] = 0;
      } else if (img && vpt[4] < this.getWidth() - img.width * zoom) {
        vpt[4] = this.getWidth() - img.width * zoom;
      }
      if (!img) {
        vpt[5] = 0;
      } else if (this.getHeight() > img.height * zoom) {
        // Image smaller than canvas, invert logic
        if (vpt[5] < 0) {
          vpt[5] = 0;
        } else if (img && vpt[5] > this.getHeight() - img.height * zoom) {
          vpt[5] = this.getHeight() - img.height * zoom;
        }
      } else if (vpt[5] > 0) {
        vpt[5] = 0;
      } else if (vpt[5] < this.getHeight() - img.height * zoom) {
        vpt[5] = this.getHeight() - img.height * zoom;
      }
    };

    window.addEventListener('resize', function (event) {
      this.fabCanvas.setWidth(this.elViewer.clientWidth);
      this.fabCanvas.setHeight(this.elViewer.clientHeight);
    }.bind(this));

    this.fabCanvas.on('after:render', function (opt) {
      this.upperCanvasEl.parentNode.classList.remove('rendering');
    });

    this.fabCanvas.on('mouse:wheel', function (opt) {
      const delta = opt.e.deltaY;
      let zoom = this.getZoom();
      zoom *= 0.999 ** delta;
      this.zoomToPoint({ x: opt.e.offsetX, y: opt.e.offsetY }, zoom);
      this.phLimitViewport();
      opt.e.preventDefault();
      opt.e.stopPropagation();
    });

    this.fabCanvas.on('mouse:down', function (opt) {
      const evt = opt.e;

      if (!opt.target) {
        // Mouse down not on an object, drag canvas
        this.isDragging = true;
        this.selection = false;
        this.lastPosX = evt.clientX;
        this.lastPosY = evt.clientY;
      }
    });
    this.fabCanvas.on('mouse:move', function (opt) {
      if (this.isDragging) {
        const e = opt.e;
        const vpt = this.viewportTransform;
        vpt[4] += e.clientX - this.lastPosX;
        vpt[5] += e.clientY - this.lastPosY;
        this.phLimitViewport();
        this.requestRenderAll();
        this.lastPosX = e.clientX;
        this.lastPosY = e.clientY;
      }
    });
    this.fabCanvas.on('mouse:up', function (opt) {
      // on mouse up we want to recalculate new interaction
      // for all objects, so we call setViewportTransform
      this.setViewportTransform(this.viewportTransform);
      this.isDragging = false;
      this.selection = true;
    });

    this.elForm.onchange = (event) => {
      if (this.formChangeTimeout) clearTimeout(this.formChangeTimeout);
      this.formChangeTimeout = setTimeout(this.refreshFilters.bind(this), 600);
    };
  }

  refreshFilters () {
    const img = this.fabCanvas.backgroundImage;
    const phFilters = formson.form_to_object(this.elForm);

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

    this.fabCanvas.upperCanvasEl.parentNode.classList.add('rendering');
    window.setTimeout(() => {
      img.applyFilters();
      this.fabCanvas.renderAll();
    }, 10);
  }

  load (blob) {
    if (!blob) {
      return new Promise((resolve) => {
        this.fabCanvas.setBackgroundImage(undefined);
        resolve();
      });
    }

    return window.createImageBitmap(blob).then((origBitmap) => {
      const img = new fabric.Image(origBitmap, {
        selectable: false
      });
      this.fabCanvas.setBackgroundImage(img);

      // Zoom viewport to fit image
      this.fabCanvas.phFitViewport(img);

      this.refreshFilters();
    });
  }
}

class PhCropper extends PhViewer {
  constructor (elViewer) {
    super(elViewer);
    this.fabCanvas.uniformScaling = false; // Don't try to preserve aspect-ratio when resizing rects
  }

  boundingBox () {
    if (this.fabCanvas.getObjects().length > 0) return this.fabCanvas.getObjects()[0];
    const boundingBox = new fabric.Rect({
      fill: 'rgba(50,255,255,0.3)',
      width: this.fabCanvas.width,
      height: this.fabCanvas.height,
      hasBorders: false,
      hasControls: true,
      lockRotation: true,
      stroke: 'rgba(50,255,255,0)',
      transparentCorners: false
    });
    boundingBox.setControlsVisibility({ mtr: false });
    this.fabCanvas.add(boundingBox);
    return boundingBox;
  }

  shiftBoundingBox () {
    const boundingBox = this.boundingBox();

    if (boundingBox.left + boundingBox.width * 2 > this.fabCanvas.backgroundImage.width) {
      // Falling of right edge, skip down to next line
      boundingBox.top += boundingBox.height + boundingBox.height * 0.1;
      boundingBox.left = 0;
    } else {
      // Shunt to right
      boundingBox.left += boundingBox.width + boundingBox.width * 0.1;
    }
    this.fabCanvas.requestRenderAll();
  }

  load (blob) {
    return super.load(blob).then(() => {
      const boundingBox = this.boundingBox();

      if (!this.fabCanvas.backgroundImage) {
        this.fabCanvas.remove(boundingBox);
      } else {
        boundingBox.left = this.fabCanvas.backgroundImage.width / 5;
        boundingBox.top = this.fabCanvas.backgroundImage.height / 5;
        boundingBox.width = this.fabCanvas.backgroundImage.width / 10;
        boundingBox.height = this.fabCanvas.backgroundImage.height / 10;
        this.fabCanvas.setActiveObject(boundingBox);
      }
    });
  }
}

export function init (window) {
  window.document.querySelectorAll('div.ph-viewer').forEach((elViewer) => {
    const idPrefix = 'ph-viewer-' + (Math.random() + 1).toString(36).slice(2);

    // TODO: Translations for labels
    elViewer.innerHTML = `
      <canvas class="image"></canvas>
      <div class="dropdown">
        <button class="btn btn-secondary dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false">
          <!-- https://icons.getbootstrap.com/icons/magic/ -->
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-magic" viewBox="0 0 16 16">
            <path d="M9.5 2.672a.5.5 0 1 0 1 0V.843a.5.5 0 0 0-1 0v1.829Zm4.5.035A.5.5 0 0 0 13.293 2L12 3.293a.5.5 0 1 0 .707.707L14 2.707ZM7.293 4A.5.5 0 1 0 8 3.293L6.707 2A.5.5 0 0 0 6 2.707L7.293 4Zm-.621 2.5a.5.5 0 1 0 0-1H4.843a.5.5 0 1 0 0 1h1.829Zm8.485 0a.5.5 0 1 0 0-1h-1.829a.5.5 0 0 0 0 1h1.829ZM13.293 10A.5.5 0 1 0 14 9.293L12.707 8a.5.5 0 1 0-.707.707L13.293 10ZM9.5 11.157a.5.5 0 0 0 1 0V9.328a.5.5 0 0 0-1 0v1.829Zm1.854-5.097a.5.5 0 0 0 0-.706l-.708-.708a.5.5 0 0 0-.707 0L8.646 5.94a.5.5 0 0 0 0 .707l.708.708a.5.5 0 0 0 .707 0l1.293-1.293Zm-3 3a.5.5 0 0 0 0-.706l-.708-.708a.5.5 0 0 0-.707 0L.646 13.94a.5.5 0 0 0 0 .707l.708.708a.5.5 0 0 0 .707 0L8.354 9.06Z"/>
          </svg>
        </button>
        <div class="dropdown-menu">
          <form class="px-1">
            <div>
              <label for="${idPrefix}-brightness-input">Brightness:</label>
              <input type="range" name="brightness" class="form-range" id="${idPrefix}-brightness-input" min="-1" max="1" value="0" step="0.01" />
            </div>
            <div>
              <label for="${idPrefix}-contrast-input">Contrast:</label>
              <input type="range" name="contrast" class="form-range" id="${idPrefix}-contrast-input" min="-1" max="1" value="0" step="0.01" />
            </div>
            <div>
              <label for="${idPrefix}-gamma-input">Gamma:</label>
              <input type="range" name="gamma" class="form-range" id="${idPrefix}-gamma-input" min="0.01" max="2.2" value="1" step="0.01" />
            </div>
            <div>
              <label for="${idPrefix}-saturation-input">Saturation:</label>
              <input type="range" name="saturation" class="form-range" id="${idPrefix}-saturation-input" min="-1" max="1" value="0" step="0.01" />
            </div>
            <div>
              <label for="${idPrefix}-vibrance-input">Vibrance:</label>
              <input type="range" name="vibrance" class="form-range" id="${idPrefix}-vibrance-input" min="-1" max="1" value="0" step="0.01" />
            </div>
            <div class="form-check">
              <input class="form-check-input" type="checkbox" name="laplace" id="${idPrefix}-laplace-input">
              <label class="form-check-label" for="${idPrefix}-laplace-input">Edge detection</label>
            </div>
          </form>
        </div>
      </div>
    `;

    if (elViewer.classList.contains('ph-cropper')) return new PhCropper(elViewer);
    return new PhViewer(elViewer);
  });
}
