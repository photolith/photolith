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
    }).finally(() => {
      const elDl = this.elViewer.querySelector(':scope .download-link');

      elDl.href = blob && this.fabCanvas.backgroundImage ? URL.createObjectURL(blob) : '#';
      elDl.download = blob && this.fabCanvas.backgroundImage ? blob.name : undefined;
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
    this.fabCanvas.on({
      'selection:created': this.selection.bind(this),
      'selection:updated': this.selection.bind(this)
    });
  }

  selection (opt) {
    for (let i = 0; i < opt.selected.length; i++) {
      const m = (opt.selected[i].id || '').match(/^individuals\[(.*)\]\[bounding_box\]$/);

      if (m) {
        this.elSyncForm.selected_individual.value = m[1];
        this.elSyncForm.selected_individual.dispatchEvent(new window.UIEvent('change', {
          view: window,
          bubbles: true,
          cancelable: true
        }));
      }
    }
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

  boundingBox (objId, title) {
    // http://fabricjs.com/docs/fabric.Textbox.html
    const obj = this.fabCanvas.phGetObjectById(objId) || new fabric.Textbox(title.toString(), {
      id: objId,
      fontFamily: 'Arial',
      fontSize: 90,
      fontWeight: 'bold',
      backgroundColor: 'rgba(50,255,255,0.3)',
      stroke: 'rgba(50,255,255,1)',
      fill: 'black',
      textAlign: 'center',
      editable: false,
      hasBorders: false,
      hasControls: true,
      lockRotation: true,
      transparentCorners: false
    });

    obj.setControlsVisibility({ mtr: false });
    if (!obj.canvas) {
      this.fabCanvas.add(obj);

      // Set initial position based on boundingBoxCount
      this.boundingBoxCount++;
      const countWidth = 5; const countHeight = 5;
      const marginWidth = this.fabCanvas.backgroundImage.width / 7;
      const marginHeight = this.fabCanvas.backgroundImage.height / 7;
      const boxWidth = (this.fabCanvas.backgroundImage.width - marginWidth * 2) / countWidth;
      const boxHeight = (this.fabCanvas.backgroundImage.height - marginHeight * 2) / countHeight;

      obj.set({
        left: marginWidth + (this.boundingBoxCount % countWidth) * boxWidth,
        top: marginHeight + Math.min(Math.floor(this.boundingBoxCount / countWidth), countHeight) * boxHeight,
        width: boxWidth * 0.9,
        height: boxHeight * 0.8,
        fontSize: boxHeight * 0.8,
        scaleX: 1,
        scaleY: 1
      });

      obj.on('scaling', (opt) => {
        const obj = opt.transform.target;

        // Instead of scaling the text, change the fontSize to suit
        // NB: Ideally the final value of fontSize would take into account the width too, but close enough
        obj.set({
          width: obj.width * (obj.scaleX || 1),
          height: obj.height * (obj.scaleY || 1),
          fontSize: obj.fontSize * (obj.scaleY || 1),
          scaleX: 1,
          scaleY: 1
        });
      });
      obj.on('select', (opt) => {

      });
    }

    return obj;
  }

  scaleLine () {
    const obj = this.fabCanvas.phGetObjectById('scale_line') || new EditableLine({
      id: 'scale_line'
    });
    if (!obj.canvas) this.fabCanvas.add(obj);
    return obj;
  }

  load (blob) {
    return super.load(blob).then(() => {
    }).finally(() => { // NB: Set-up bounding box even if loading failed
      this.fabCanvas.getObjects().forEach((o) => this.fabCanvas.remove(o));
      this.boundingBoxCount = -1;

      if (this.fabCanvas.backgroundImage) {
        const scaleLine = this.scaleLine();

        scaleLine.phSetPoints([
          new fabric.Point(this.fabCanvas.backgroundImage.width / 10, this.fabCanvas.backgroundImage.height / 10),
          new fabric.Point(this.fabCanvas.backgroundImage.width / 5, this.fabCanvas.backgroundImage.height / 10)
        ]);
      }
    });
  }

  loadIndividuals (ids) {
    this.fabCanvas.getObjects().forEach((o) => {
      if ((o.id || '').match(/^individuals\[(.*)\]\[bounding_box\]$/)) this.fabCanvas.remove(o);
    });
    ids.forEach((ind, i) => this.boundingBox(`individuals[${i}][bounding_box]`, ind.title));
    this.syncForm();
  }
}

export function init (window) {
  window.document.querySelectorAll('div.ph-viewer').forEach((elViewer) => {
    const v = elViewer.classList.contains('ph-cropper') ? new PhCropper(elViewer) : new PhViewer(elViewer);

    if (elViewer.hasAttribute('data-sync-form')) {
      v.elSyncForm = document.querySelector(elViewer.getAttribute('data-sync-form'));
      v.elSyncForm.addEventListener('load_individuals', (event) => {
        v.loadIndividuals(event.detail);
      });
      v.elSyncForm.addEventListener('load_file', (event) => {
        v.load(event.detail.file);
      });
    }
    return v;
  });
}
