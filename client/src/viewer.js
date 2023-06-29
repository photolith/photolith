import { fabric } from 'fabric';
import EditableLine from './viewer/editable_line';
const formson = require('formson');

class PhViewer {
  constructor (elViewer) {
    this.elViewer = elViewer;
    this.elForm = this.elViewer.querySelector(':scope form');

    if (fabric.isWebglSupported()) {
      // TODO; fabric.maxTextureSize is 1 << 14, but setting it results in 2d fallback(?)
      fabric.textureSize = Math.max(8192, fabric.maxTextureSize);
    }

    this.fabCanvas = new fabric.Canvas(this.elViewer.querySelector(':scope > canvas.image'));
    this.fabCanvas.setWidth(this.elViewer.clientWidth);
    this.fabCanvas.setHeight(this.elViewer.clientHeight);

    this.fabCanvas.phGetObjectById = function (wantedId) {
      const objs = this.getObjects();

      for (let i = 0; i < objs.length; i++) {
        if (objs[i].id === wantedId) return objs[i];
      }
      return undefined;
    };

    this.fabCanvas.phFitViewport = function (obj) {
      const zoom = Math.min(
        this.height / obj.height,
        this.width / obj.width
      );
      this.setViewportTransform([zoom, 0, 0, zoom, (this.width - obj.width * zoom) / 2, (this.height - obj.height * zoom) / 2]);
      this.getObjects().forEach((o) => o.fire('phCanvasZoom', zoom));
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
      this.getObjects().forEach((o) => o.fire('phCanvasZoom', zoom));
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
    this.elForm.onreset = (event) => {
      if (this.formChangeTimeout) clearTimeout(this.formChangeTimeout);
      this.formChangeTimeout = setTimeout(this.refreshFilters.bind(this), 10);
    };

    this.elViewer.addEventListener('load_file', (event) => {
      const elDl = this.elViewer.querySelector(':scope .download-link');

      elDl.href = event.detail.file ? URL.createObjectURL(event.detail.file) : '#';
      elDl.download = event.detail.file ? event.detail.file.name : undefined;
      this.load(event.detail.file);
    });
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
    this.fabCanvas.setBackgroundImage(undefined);
    this.fabCanvas.requestRenderAll();
    if (!blob) return Promise.resolve();

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

    this.fabCanvas.on('object:added', this.syncForm.bind(this));
    this.fabCanvas.on('object:modified', this.syncForm.bind(this));
    this.fabCanvas.on('object:removed', this.syncForm.bind(this));
  }

  syncForm (opt) {
    function roundPoint (p) {
      return [Math.round(p.x), Math.round(p.y)];
    }

    const setForm = (name, value) => {
      if (!this.elSyncForm.elements[name]) return;
      this.elSyncForm.elements[name].value = value === null ? '' : JSON.stringify(value);
    };

    // If part of an event, null whatever received the event, so removals propogate
    if (opt && opt.target.id) setForm(opt.target.id, null);

    this.fabCanvas.getObjects().forEach((obj) => {
      if (!obj.id) {
        // Ignore unnamed objects
      } else if (obj instanceof fabric.Polyline) {
        const objToCanvas = obj.calcTransformMatrix();

        setForm(obj.id, obj.points.map((p) => {
          return roundPoint(fabric.util.transformPoint(p, objToCanvas));
        }));
      } else {
        const ac = obj.calcACoords();

        setForm(obj.id, [roundPoint(ac.tl), roundPoint(ac.br)]);
      }
    });
  }

  boundingBox () {
    const boundingBox = this.fabCanvas.phGetObjectById('bounding_box') || new fabric.Rect({
      id: 'bounding_box',
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
    if (!boundingBox.canvas) this.fabCanvas.add(boundingBox);
    return boundingBox;
  }

  scaleLine () {
    const obj = this.fabCanvas.phGetObjectById('scale_line') || new EditableLine({
      id: 'scale_line'
    });
    if (!obj.canvas) this.fabCanvas.add(obj);
    return obj;
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
    }).finally(() => { // NB: Set-up bounding box even if loading failed
      const boundingBox = this.boundingBox();
      const scaleLine = this.scaleLine();

      if (!this.fabCanvas.backgroundImage) {
        this.fabCanvas.getObjects().forEach((o) => this.fabCanvas.remove(o));
      } else {
        boundingBox.left = this.fabCanvas.backgroundImage.width / 5;
        boundingBox.top = this.fabCanvas.backgroundImage.height / 5;
        boundingBox.width = this.fabCanvas.backgroundImage.width / 10;
        boundingBox.height = this.fabCanvas.backgroundImage.height / 10;
        scaleLine.phSetPoints([
          new fabric.Point(this.fabCanvas.backgroundImage.width / 10, this.fabCanvas.backgroundImage.height / 10),
          new fabric.Point(this.fabCanvas.backgroundImage.width / 5, this.fabCanvas.backgroundImage.height / 10)
        ]);
        this.syncForm();

        this.fabCanvas.setActiveObject(boundingBox);
      }
    });
  }
}

export function loadFile (elViewer, f) {
  elViewer.dispatchEvent(new window.CustomEvent('load_file', {
    detail: { file: f }
  }));
}

export function init (window) {
  window.document.querySelectorAll('div.ph-viewer').forEach((elViewer) => {
    const v = elViewer.classList.contains('ph-cropper') ? new PhCropper(elViewer) : new PhViewer(elViewer);

    if (elViewer.hasAttribute('data-sync-form')) {
      v.elSyncForm = document.querySelector(elViewer.getAttribute('data-sync-form'));
      v.elSyncForm.addEventListener('advance_individual', (event) => {
        v.shiftBoundingBox();
      });
    }
    return v;
  });
}
