import { fabric } from 'fabric';

import { PhSyncingViewer } from './syncing';
import EditableLine from './editable_line';

const rgbHighlight = window.getComputedStyle(document.documentElement).getPropertyValue('--bs-info-rgb');

export class PhAnnotate extends PhSyncingViewer {
  constructor (elViewer) {
    super(elViewer);

    // Sync phSnapToAxis state with canvas & sessionStorage
    const phSnapToAxis = document.querySelector('#ph-viewer-snap-to-axis');
    phSnapToAxis.addEventListener('change', (event) => {
      window.sessionStorage.setItem('ph-viewer-snap-to-axis', event.target.checked ? 'on' : 'off');
      this.fabCanvas.phSnapToAxis = phSnapToAxis.checked;
    });
    // NB: The control defaults to checked, so do the same here
    phSnapToAxis.checked = (window.sessionStorage.getItem('ph-viewer-snap-to-axis') || 'on') === 'on';
    this.fabCanvas.phSnapToAxis = phSnapToAxis.checked;

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
    const els = Array.from((this.elSyncForm || { elements: [] }).elements);
    els.reverse(); // NB: Reverse so we draw the polys in table order
    els.forEach((el) => {
      const m = el.name.match(/^(axis_poly|view_poly):?(\d*)$/);
      if (!m) return;
      if (el.disabled) return;

      const i = parseInt(m[2] || 0, 10);
      const obj = new EditableLine({
        id: el.name,
        stroke: `rgba(${el.getAttribute('data-stroke') || rgbHighlight}, 0.6)`
      }, {
        stroke: `rgba(${el.getAttribute('data-stroke') || rgbHighlight}, 1)`,
        radius: 5 + (i % 5),
        selectable: m[1] === 'axis_poly'
      });
      this.fabCanvas.add(obj);
    });
  }
}
