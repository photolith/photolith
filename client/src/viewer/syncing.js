import { Point, Polyline, Textbox, util } from 'fabric';

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
      this.elSyncForm.selection.dispatchEvent(changeEvent());
    }
  }

  setSyncForm (el) {
    this.elSyncForm = el;
    if (!el) return;

    document.querySelectorAll('input[type=checkbox].pref').forEach((elPref) => {
      this.fabCanvas.phPrefs[elPref.id] = elPref.checked;
    });

    this.elSyncForm.addEventListener('element_addremove', (event) => {
      this.elementAddRemove();
    });

    this.elSyncForm.addEventListener('change', (event) => {
      if (event.target.name === 'image_file') {
        this.load(event.target.phBlob, null).then(() => {
          if (!this.imgBlob) return;
          // Update form with new imgBlob, which may have actually been e.g. a video stream
          event.target.phBlob = this.imgBlob;
        });
        return;
      }

      // Update phPrefs with any checkbox information
      if (event.target.classList.contains('pref')) {
        this.fabCanvas.phPrefs[event.target.id] = event.target.checked;
        return;
      }

      this.reverseSyncForm({ target: this.fabCanvas.getObjects().find((obj) => obj.id === event.target.name) });
    });

    this.elSyncForm.addEventListener('reset', (event) => {
      // Find all form elements with a matching fabCanvas object, and update with defaultValue
      Array.from(event.target.elements).forEach((el) => {
        const obj = this.fabCanvas.getObjects().find((obj) => obj.id === el.name);

        if (obj) {
          this.reverseSyncForm({ formReset: true, target: obj });
        }
      });
    });
  }

  syncForm (opt) {
    const obj = opt.target;
    let newVal;

    /* TODO: This won't work, we need to upgrade to v6: https://github.com/photolith/photolith/issues/110
    // If we get a selection, sync everything within it
    if (obj && obj.get("type") === "activeSelection") {
      obj.getObjects().forEach((o) => { this.syncForm({ target: o })});
      return;
    }
    */

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

    if (obj instanceof Polyline) {
      const objToCanvas = obj.calcTransformMatrix();

      newVal = obj.points.map((p) => {
        return roundPoint(util.transformPoint(p, objToCanvas));
      });
    } else if (obj instanceof Textbox) {
      const p = obj.getPositionByOrigin('left', 'top');
      // NB: Using left/top/... is more accurate than obj.calcACoords()
      newVal = [
        roundPoint({ x: p.x, y: p.y }),
        roundPoint({ x: p.x + obj.width, y: p.y + obj.height })
      ];
    } else {
      const ac = obj.calcACoords();

      newVal = [roundPoint(ac.tl), roundPoint(ac.br)];
    }

    // If any of the points of this object are out-of-bounds, consider the whole thing out-of-bounds
    if (newVal.indexOf(undefined) > -1) newVal = undefined;

    // If there are phInvalid properties, set them based on current newVal
    if (obj.phInvalid) {
      // Build phValid using the current value of all properties
      if (!obj.phValid) {
        obj.phValid = {};
        Object.keys(obj.phInvalid).forEach((k) => {
          obj.phValid[k] = obj[k];
        });
      }

      obj.set(newVal === undefined ? obj.phInvalid : obj.phValid);
    }

    newVal = newVal === undefined ? '' : JSON.stringify(newVal);
    if (formEl.value !== newVal) {
      formEl.value = newVal;
      if (!opt.phSuppressChange) formEl.dispatchEvent(changeEvent());
    }
  }

  reverseSyncForm (opt) {
    const obj = opt.target;

    // No point without an associated form element
    if (!obj || !obj.id || !this.elSyncForm || !this.elSyncForm.elements[obj.id]) return;
    const formEl = this.elSyncForm.elements[obj.id];

    // NB: A form reset event fires before value is updated, so look at defaultValue
    const rawVal = opt.formReset ? formEl.defaultValue : formEl.value;
    const val = rawVal ? JSON.parse(rawVal) : undefined;

    if (val === undefined) {
      // Empty value --> form hasn't been populated yet. Do opposite
      this.syncForm({ target: obj });
    } else if (obj instanceof Polyline && obj.phSetPoints) {
      obj.phSetPoints(val.map((x) => new Point(x[0], x[1])), true);
    } else {
      if (obj instanceof Textbox && obj.text !== formEl.getAttribute('data-label')) {
        obj.text = formEl.getAttribute('data-label');
        obj.dirty = true;
        obj.canvas.requestRenderAll();
      }
      obj.width = val[1][0] - val[0][0];
      obj.height = val[1][1] - val[0][1];
      obj.setPositionByOrigin({ x: val[0][0], y: val[0][1] }, 'left', 'top');
      obj.setCoords(); // http://fabricjs.com/fabric-gotchas
      obj.fire('scaling', { transform: { target: obj } });
    }
  }
}
