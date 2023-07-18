import { fabric } from 'fabric';
import { changeEvent } from './events';
import EditableLine from './viewer/editable_line';

const rgbHighlight = window.getComputedStyle(document.documentElement).getPropertyValue('--bs-info-rgb');

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

    this.fabCanvas.phFitBoundingBox = function (boundingBox) {
      const zoom = Math.min(
        this.height / (boundingBox[1][1] - boundingBox[0][1]),
        this.width / (boundingBox[1][0] - boundingBox[0][0])
      );
      const totalX = (boundingBox[1][0] + boundingBox[0][0]);
      const totalY = (boundingBox[1][1] + boundingBox[0][1]);

      this.setViewportTransform([zoom, 0, 0, zoom, (this.width - totalX * zoom) / 2, (this.height - totalY * zoom) / 2]);
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

  load (blob, boundingBox) {
    this.fabCanvas.setBackgroundImage(undefined);
    this.fabCanvas.requestRenderAll();
    if (!blob) return Promise.resolve();

    return window.createImageBitmap(blob).then((origBitmap) => {
      const img = new fabric.Image(origBitmap, {
        selectable: false
      });
      this.fabCanvas.setBackgroundImage(img);

      // Zoom viewport to fit boundingBox, or Image
      this.fabCanvas.phFitBoundingBox(boundingBox || [[0, 0], [img.width, img.height]]);

      this.refreshFilters();
    }).finally(() => {
      const elDl = this.elViewer.querySelector(':scope .download-link');

      elDl.href = blob && this.fabCanvas.backgroundImage ? URL.createObjectURL(blob) : '#';
      elDl.download = blob && this.fabCanvas.backgroundImage ? blob.name : undefined;
    });
  }
}

class PhSyncingViewer extends PhViewer {
  constructor (elViewer) {
    super(elViewer);

    this.fabCanvas.on('object:added', this.reverseSyncForm.bind(this));
    this.fabCanvas.on('object:modified', this.syncForm.bind(this));
    this.fabCanvas.on('object:removed', this.syncForm.bind(this));
    this.fabCanvas.on({
      'selection:cleared': this.selection.bind(this),
      'selection:created': this.selection.bind(this),
      'selection:updated': this.selection.bind(this)
    });
  }

  selection (opt) {
    if (!this.elSyncForm || !this.elSyncForm.selection) return;

    let newVal = '';
    for (let i = 0; i < (opt.selected || []).length; i++) {
      if (opt.selected[i].id) {
        newVal = opt.selected[i].id;
        break;
      }
    }

    if (this.elSyncForm.selection.value !== newVal) {
      this.elSyncForm.selection.value = newVal;
      this.elSyncForm.selection.dispatchEvent(changeEvent(999));
    }
  }

  syncForm (opt) {
    const obj = opt.target;
    let newVal;

    // No point without an associated form element
    if (!obj || !obj.id || !this.elSyncForm || !this.elSyncForm.elements[obj.id]) return;
    const formEl = this.elSyncForm.elements[obj.id];

    function roundPoint (p) {
      return [Math.round(p.x), Math.round(p.y)];
    }

    if (obj instanceof fabric.Polyline) {
      const objToCanvas = obj.calcTransformMatrix();

      newVal = obj.points.map((p) => {
        return roundPoint(fabric.util.transformPoint(p, objToCanvas));
      });
    } else {
      const ac = obj.calcACoords();

      newVal = [roundPoint(ac.tl), roundPoint(ac.br)];
    }

    newVal = newVal === undefined ? '' : JSON.stringify(newVal);
    if (formEl.value !== newVal) {
      formEl.value = newVal;
      formEl.dispatchEvent(changeEvent(999));
    }
  }

  reverseSyncForm (opt) {
    const obj = opt.target;

    // No point without an associated form element
    if (!obj || !obj.id || !this.elSyncForm || !this.elSyncForm.elements[obj.id]) return;
    const formEl = this.elSyncForm.elements[obj.id];

    const val = formEl.value ? JSON.parse(formEl.value) : undefined;

    if (val === undefined) {
      // Empty value --> form hasn't been populated yet. Do opposite
      this.syncForm({ target: obj });
    } else if (obj instanceof fabric.Polyline && obj.phSetPoints) {
      obj.phSetPoints(val.map((x) => new fabric.Point(x[0], x[1])));
    } else {
      throw new Error(`Cannot apply value to ${obj.id}`);
    }
  }
}

class PhCropper extends PhSyncingViewer {
  constructor (elViewer) {
    super(elViewer);
    this.fabCanvas.uniformScaling = false; // Don't try to preserve aspect-ratio when resizing rects
  }

  boundingBox (objId, title) {
    // http://fabricjs.com/docs/fabric.Textbox.html
    const obj = this.fabCanvas.phGetObjectById(objId) || new fabric.Textbox(title.toString(), {
      id: objId,
      fontFamily: 'Arial',
      fontSize: 90,
      fontWeight: 'bold',
      backgroundColor: `rgba(${rgbHighlight},0.3)`,
      stroke: `rgba(${rgbHighlight},1)`,
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

      this.fabCanvas.add(obj);
    }

    return obj;
  }

  scaleLine () {
    const obj = this.fabCanvas.phGetObjectById('scale_line') || new EditableLine({
      id: 'scale_line',
      stroke: `rgba(${rgbHighlight}, 0.6)`
    }, {
      stroke: `rgba(${rgbHighlight}, 1)`
    });
    if (!obj.canvas) this.fabCanvas.add(obj);
    return obj;
  }

  load (blob, boundingBox) {
    return super.load(blob, boundingBox).then(() => {
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
    ids.forEach((ind, i) => {
      const obj = this.boundingBox(`individuals[${i}][bounding_box]`, ind.title);
      if (i === 0) this.fabCanvas.setActiveObject(obj);
    });
  }
}

class PhAnnotate extends PhSyncingViewer {
  annotatePoly () {
    const obj = this.fabCanvas.phGetObjectById('bisect_poly') || new EditableLine({
      id: 'bisect_poly',
      stroke: `rgba(${rgbHighlight}, 0.6)`
    }, {
      stroke: `rgba(${rgbHighlight}, 1)`
    });
    if (obj.canvas) return obj;

    this.fabCanvas.add(obj);
    this.fabCanvas.on('mouse:dblclick', (opt) => {
      if (opt.target) {
        obj.phRemoveNode(opt.target);
      } else {
        obj.phAddNode(fabric.util.transformPoint(
          new fabric.Point(opt.e.offsetX, opt.e.offsetY),
          fabric.util.invertTransform(this.fabCanvas.viewportTransform)
        ), opt);
      }
    });
    return obj;
  }

  load (blob, boundingBox) {
    return super.load(blob, boundingBox).then(() => {
    }).finally(() => { // NB: Set-up even if loading failed
      this.fabCanvas.getObjects().forEach((o) => this.fabCanvas.remove(o));

      if (this.fabCanvas.backgroundImage) {
        this.annotatePoly();
      }
    });
  }
}

export function init (window) {
  window.document.querySelectorAll('div.ph-viewer').forEach((elViewer) => {
    const v = elViewer.classList.contains('ph-annotate') ? new PhAnnotate(elViewer) : elViewer.classList.contains('ph-cropper') ? new PhCropper(elViewer) : new PhViewer(elViewer);

    if (elViewer.hasAttribute('data-sync-form')) {
      v.elSyncForm = document.querySelector(elViewer.getAttribute('data-sync-form'));
      v.elSyncForm.addEventListener('load_individuals', (event) => {
        v.loadIndividuals(event.detail);
      });
      v.elSyncForm.addEventListener('change', (event) => {
        if (event.detail === 999) return; // Break loops
        v.reverseSyncForm({ target: v.fabCanvas.phGetObjectById(event.target.name) });
      });
      v.elSyncForm.addEventListener('load_file', (event) => {
        v.load(event.detail.file, event.detail.bounding_box);
      });
    }

    if (elViewer.hasAttribute('data-src')) {
      window.fetch(elViewer.getAttribute('data-src')).then((resp) => {
        if (!resp.ok) throw new Error(resp.statusText);
        return resp.blob();
      }).then((blob) => {
        v.load(blob, JSON.parse(elViewer.getAttribute('data-bounding-box') || 'null'));
      });
    }
    return v;
  });
}
