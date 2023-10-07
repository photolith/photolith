import { fabric } from 'fabric';

import { PhSyncingViewer } from './syncing';
import EditableLine from './editable_line';

const rgbHighlight = window.getComputedStyle(document.documentElement).getPropertyValue('--bs-info-rgb');

export class PhCropper extends PhSyncingViewer {
  constructor (elViewer) {
    super(elViewer);
    this.fabCanvas.uniformScaling = false; // Don't try to preserve aspect-ratio when resizing rects
  }

  boundingBox (objId, label, boundingBoxPos) {
    // http://fabricjs.com/docs/fabric.Textbox.html
    const obj = new fabric.Textbox(label, {
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
      // Set initial position based on boundingBoxPos
      const countWidth = 5; const countHeight = 5;
      const marginWidth = this.fabCanvas.backgroundImage.width / 7;
      const marginHeight = this.fabCanvas.backgroundImage.height / 7;
      const boxWidth = (this.fabCanvas.backgroundImage.width - marginWidth * 2) / countWidth;
      const boxHeight = (this.fabCanvas.backgroundImage.height - marginHeight * 2) / countHeight;

      obj.set({
        left: marginWidth + (boundingBoxPos % countWidth) * boxWidth,
        top: marginHeight + Math.min(Math.floor(boundingBoxPos / countWidth), countHeight) * boxHeight,
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
    const obj = new EditableLine({
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

      if (this.fabCanvas.backgroundImage) {
        const scaleLine = this.scaleLine();

        scaleLine.phSetPoints([
          new fabric.Point(this.fabCanvas.backgroundImage.width / 10, this.fabCanvas.backgroundImage.height / 10),
          new fabric.Point(this.fabCanvas.backgroundImage.width / 5, this.fabCanvas.backgroundImage.height / 10)
        ]);
      }
    });
  }

  loadIndividuals () {
    let setActive = false;
    const elIndividual = this.elSyncForm.elements.individual;
    const selIndividual = elIndividual.options[elIndividual.selectedIndex].value;
    let boundingBoxPos = 0;

    this.fabCanvas.getObjects().forEach((o) => {
      if ((o.id || '').match(/^bounding_box:(.*)$/)) this.fabCanvas.remove(o);
    });
    Array.from(this.elSyncForm.elements).forEach((el) => {
      const m = el.name.match(/^bounding_box:(.*)$/);

      if (!m) return;
      if (selIndividual && selIndividual !== m[1]) return;
      const obj = this.boundingBox(el.name, el.getAttribute('data-label'), boundingBoxPos);
      boundingBoxPos++;
      if (!setActive) {
        this.fabCanvas.setActiveObject(obj);
        setActive = true;
      }
    });
  }
}
