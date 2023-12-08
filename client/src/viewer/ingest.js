import { fabric } from 'fabric';

import { PhSyncingViewer } from './syncing';
import EditableLine from './editable_line';

const rgbHighlight = window.getComputedStyle(document.documentElement).getPropertyValue('--bs-info-rgb');

function setInitBBs (bbEls, width, height) {
  // Set initial position based on count
  // NB: Special case: A single bounding box covers the entire area
  const grid = bbEls.length === 1
    ? { w: 1, h: 1 }
    : { w: 5, h: 5 };
  const margin = bbEls.length === 1
    ? { w: 0, h: 0 }
    : { w: width / 7, h: height / 7 };
  const box = {
    w: (width - margin.w * 2) / grid.w,
    h: (height - margin.h * 2) / grid.h
  };
  const gutter = bbEls.length === 1
    ? { w: 0, h: 0 }
    : { w: box.w * 0.1, h: box.h * 0.2 };

  bbEls.forEach((el, i) => {
    const left = margin.w + (i % grid.w) * box.w;
    const top = margin.h + Math.min(Math.floor(i / grid.w), grid.h) * box.h;

    el.value = JSON.stringify([
      [left, top],
      [left + box.w - gutter.w, top + box.h - gutter.h]
    ]);
  });
}

export class PhCropper extends PhSyncingViewer {
  constructor (elViewer) {
    super(elViewer);
    this.fabCanvas.uniformScaling = false; // Don't try to preserve aspect-ratio when resizing rects
  }

  boundingBox (objId, label) {
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
      obj.set({
        scaleX: 1,
        scaleY: 1
      });

      obj.on('scaling', (opt) => {
        const obj = opt.transform.target;

        // Instead of scaling the text, change the fontSize to suit
        // NB: Ideally the final value of fontSize would take into account the width too, but close enough
        const height = obj.height * (obj.scaleY || 1);
        obj.set({
          width: obj.width * (obj.scaleX || 1),
          fontSize: height * 0.9, // Line up text to center better
          scaleX: 1,
          scaleY: 1
        });
        // Set height after fontSize, to defeat the font oversizing the box
        obj.set({ height: height });
        obj.setCoords();
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

  elementAddRemove () {
    this.fabCanvas.getObjects().forEach((o) => {
      if ((o.id || '').match(/^bounding_box:(.*)$/)) this.fabCanvas.remove(o);
    });

    // Find all bounding_box:* elements that aren't disabled
    const bbEls = Array.from(this.elSyncForm.elements).filter((el) => {
      return !el.disabled && el.name.match(/^bounding_box:.*$/);
    });

    // Set bounding boxes into a grid
    setInitBBs(bbEls, this.fabCanvas.backgroundImage.width, this.fabCanvas.backgroundImage.height);

    // Create canvas elements for each
    bbEls.forEach((el, i) => {
      const obj = this.boundingBox(el.name, el.getAttribute('data-label'));
      if (i === 0) {
        this.fabCanvas.setActiveObject(obj);
      }
      // Stack objects backwards, so scale line is on top
      this.fabCanvas.sendToBack(obj);
    });
  }
}
