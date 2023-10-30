import { fabric } from 'fabric';

import { PhSyncingViewer } from './syncing';
import EditableLine from './editable_line';

const rgbHighlight = window.getComputedStyle(document.documentElement).getPropertyValue('--bs-info-rgb');

const existingPallete = [
  '230, 159, 0',
  '0, 158, 115',
  '240, 228, 66',
  '0, 144, 178',
  '213, 94, 0',
  '204, 121, 167'
];

export class PhAnnotate extends PhSyncingViewer {
  constructor (elViewer) {
    super(elViewer);

    this.fabCanvas.on('mouse:dblclick', (opt) => {
      const obj = this.fabCanvas.getObjects().find((obj) => obj.id === 'axis_poly');

      if (!obj) {
        // No axis_poly, nothing to do
      } else if (opt.target && opt.target.phNodeIdx > 0 && opt.target.phNodeIdx < obj.phNodes.length - 1) {
        // Double-clicked on a mid-node, remove it
        obj.phRemoveNode(opt.target);
      } else {
        // Double-clicked elsewhere (NB: including on an end-node), add a new node
        obj.phAddNode(fabric.util.transformPoint(
          new fabric.Point(opt.e.offsetX, opt.e.offsetY),
          fabric.util.invertTransform(this.fabCanvas.viewportTransform)
        ), opt);
      }
    });
  }

  annotatePoly () {
    const obj = new EditableLine({
      id: 'axis_poly',
      stroke: `rgba(${rgbHighlight}, 0.6)`
    }, {
      stroke: `rgba(${rgbHighlight}, 1)`
    });
    if (obj.canvas) return obj;

    this.fabCanvas.add(obj);
    return obj;
  }

  load (blob, boundingBox) {
    return super.load(blob, boundingBox).then(() => {
    }).finally(() => { // NB: Set-up even if loading failed
      this.fabCanvas.getObjects().forEach((o) => this.fabCanvas.remove(o));

      if (this.fabCanvas.backgroundImage) {
        this.elementAddRemove();
      }
    });
  }

  elementAddRemove () {
    this.fabCanvas.getObjects().forEach((o) => {
      // NB: Have to remove poly & sub-objects
      if ((o.id || '').match(/^axis_poly|^view_poly/)) this.fabCanvas.remove(o);
    });
    Array.from(this.elSyncForm.elements).forEach((el) => {
      const m = el.name.match(/^axis_poly$|^view_poly:(\d+)$/);
      if (!m) return;

      if (el.name === 'axis_poly') {
        if (!el.disabled) this.annotatePoly();
        return;
      }

      const i = parseInt(m[1], 10);
      const obj = new EditableLine({
        id: el.name,
        stroke: `rgba(${existingPallete[i % existingPallete.length]}, 0.6)`
      }, {
        stroke: `rgba(${existingPallete[i % existingPallete.length]}, 1)`,
        radius: 10 - (i % 5),
        selectable: false
      });
      this.fabCanvas.add(obj);
    });
  }
}
