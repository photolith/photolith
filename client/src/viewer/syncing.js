import { fabric } from 'fabric';

import { changeEvent } from '../events';
import { PhFilteringViewer } from './filtering';

export class PhSyncingViewer extends PhFilteringViewer {
  constructor (elViewer) {
    super(elViewer);

    this.fabCanvas.on('object:added', this.reverseSyncForm.bind(this));
    this.fabCanvas.on('object:modified', this.syncForm.bind(this));
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

  setSyncForm (el) {
    this.elSyncForm = el;
    if (!el) return;

    this.elSyncForm.addEventListener('element_addremove', (event) => {
      this.elementAddRemove();
    });

    this.elSyncForm.addEventListener('change', (event) => {
      if (event.detail === 999) return; // Break loops
      if (event.target.name === 'image_file') {
        this.load(event.target.phBlob, null).then(() => {
          if (!this.imgBlob) return;
          // Update form with new imgBlob, which may have actually been e.g. a video stream
          event.target.phBlob = this.imgBlob;
        });
        return;
      }

      this.reverseSyncForm({ target: this.fabCanvas.getObjects().find((obj) => obj.id === event.target.name) });
    });
  }

  syncForm (opt) {
    const obj = opt.target;
    let newVal;

    // No point without an associated form element
    if (!obj || !obj.id || !this.elSyncForm || !this.elSyncForm.elements[obj.id]) return;
    const formEl = this.elSyncForm.elements[obj.id];

    function roundPoint (p) {
      const out = [Math.round(p.x), Math.round(p.y)];
      // If outside bounds, return undefined instead of the point
      if (obj.canvas.backgroundImage) {
        if (out[0] < 0 || out[0] > obj.canvas.backgroundImage.width) return undefined;
        if (out[1] < 0 || out[1] > obj.canvas.backgroundImage.height) return undefined;
      }
      return out;
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

    // If any of the points of this object are out-of-bounds, consider the whole thing out-of-bounds
    if (newVal.indexOf(undefined) > -1) newVal = undefined;

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
      obj.left = val[0][0];
      obj.top = val[0][1];
      obj.width = val[1][0] - val[0][0];
      obj.height = val[1][0] - val[1][0];
      obj.setCoords(); // http://fabricjs.com/fabric-gotchas

      if (this.canvas) {
        this.canvas.fire('object:modified', { target: this });
        this.canvas.requestRenderAll();
      }
    }
  }
}
