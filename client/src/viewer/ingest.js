import { fabric } from 'fabric';

import { PhSyncingViewer } from './syncing';
import EditableLine from './editable_line';
import { thresholdLocalOtsu, iterPixelsInRect, normaliseSelection } from '../image/threshold.js';

const rgbHighlight = window.getComputedStyle(document.documentElement).getPropertyValue('--bs-info-rgb');
const rgbInvalid = window.getComputedStyle(document.documentElement).getPropertyValue('--bs-danger-rgb');

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

function validScale (l, bgWidth, bgHeight) {
  // l must have 2 points, both within the image
  if (l.length !== 2) return false;
  if (l[0].length !== 2 || l[1].length !== 2) return false;
  if (l[0][0] < 0 || l[0][0] > bgWidth) return false;
  if (l[0][1] < 0 || l[0][1] > bgHeight) return false;
  if (l[1][0] < 0 || l[1][0] > bgWidth) return false;
  if (l[1][1] < 0 || l[1][1] > bgHeight) return false;
  return true;
}

// Find bounding box of object at (startX, startY) in (bkgdImg)
function autoCrop (bkgdImg, startX, startY) {
  // Reduce resolution of our working offscreen image, means:
  // * We take an average for the reference pixel
  // * We reduce the getImageData() calls, which are very slow on FireFox
  // * We have a degree of margin on the result
  // Rougly scale image to 512 pixels wide
  const rescale = bkgdImg._originalElement.width > 512 ? 1 / Math.round(bkgdImg._originalElement.width / 512) : 1;

  // Does at least one pixel in (iterData) match (reference)?
  function withinObject (iterData, reference) {
    for (const d of iterData) {
      if ((d & 0x1) === (reference & 0x1)) return true;
    }
  }

  // Draw background image onto offscreen canvas, get 2d context to read
  let context = null;
  if (!window.OffscreenCanvas) {
    // Don't do any cropping without being able to add an offscreen canvas
    console.warning("Browser doesn't support OffscreenCanvas");
    return null;
  } else if (!bkgdImg.phOffScreen) {
    // Attach canvas to FabricImage, so it gets thrown away when background changes
    bkgdImg.phOffScreen = new window.OffscreenCanvas(
      bkgdImg._originalElement.width * rescale,
      bkgdImg._originalElement.height * rescale
    );
    context = bkgdImg.phOffScreen.getContext('2d', { willReadFrequently: true });
    context.drawImage(bkgdImg._originalElement, 0, 0, bkgdImg.phOffScreen.width, bkgdImg.phOffScreen.height);
  } else {
    // Already got one, just open context
    context = bkgdImg.phOffScreen.getContext('2d', { willReadFrequently: true });
  }

  // Generate monochrome thresholded vesion if not already present
  if (!bkgdImg.phThresholded) {
    bkgdImg.phThresholded = normaliseSelection(thresholdLocalOtsu(
      context.getImageData(0, 0, context.canvas.width, context.canvas.height, { colorSpace: 'srgb' }),
      // i.e. ~55 pixels
      Math.floor(context.canvas.width * 0.053)
    ));
    // document.body.append(debugPreview(bkgdImg.phThresholded));
  }
  const thresholdedImage = bkgdImg.phThresholded;

  // Find reference pixel state
  const reference = thresholdedImage[Math.floor(startY * rescale) * thresholdedImage.phWidth + Math.floor(startX * rescale)];

  // Draw box around edge, fetch data & expand if within object, stop once nothing more to find
  let x1 = Math.floor(startX * rescale) - 1;
  let y1 = Math.floor(startY * rescale) - 1;
  let x2 = Math.floor(startX * rescale);
  let y2 = Math.floor(startY * rescale);
  let updated = true;
  while (updated) {
    updated = false;
    // top
    if (withinObject(iterPixelsInRect(thresholdedImage, x1, y1, x2, y1), reference)) {
      updated = true;
      y1--;
    }
    // right
    if (withinObject(iterPixelsInRect(thresholdedImage, x2, y1, x2, y2), reference)) {
      updated = true;
      x2++;
    }
    // bottom
    if (withinObject(iterPixelsInRect(thresholdedImage, x1, y2, x2, y2), reference)) {
      updated = true;
      y2++;
    }
    // left
    if (withinObject(iterPixelsInRect(thresholdedImage, x1, y1, x1, y2), reference)) {
      updated = true;
      x1--;
    }
  }

  // offscreen pixels will bias to the top-left, make the bounding box one bigger to have a more balanced margin
  x1 = Math.max(0, x1);
  y1 = Math.max(0, y1);
  x2 = Math.min(bkgdImg.phOffScreen.width, x2 + 1);
  y2 = Math.min(bkgdImg.phOffScreen.height, y2 + 1);

  return { x1: x1 / rescale, y1: y1 / rescale, x2: x2 / rescale, y2: y2 / rescale };
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
      phInvalid: {
        backgroundColor: `rgba(${rgbInvalid},0.3)`,
        stroke: `rgba(${rgbInvalid},1)`
      },
      fill: 'black',
      textAlign: 'center',
      editable: false,
      hasBorders: false,
      hasControls: true,
      lockRotation: true,
      transparentCorners: false,
      scaleX: 1,
      scaleY: 1
    });
    obj.setControlsVisibility({ mtr: false });

    obj.phSnapToEdge = function (moving = false) {
      const tolerance = 10 / this.canvas.getZoom();

      // If moving, we should keep the width/height constant, and move the box
      // Otherwise, we should vary width/height and steady the boxes position
      if (Math.abs(this.top) < tolerance) {
        this.set(moving
          ? { top: 0 }
          : {
              top: 0,
              fontSize: (this.height + this.top) / this._fontSizeMult
            });
      }
      if (Math.abs(this.left) < tolerance) {
        this.set(moving
          ? { left: 0 }
          : {
              left: 0,
              width: this.width + this.left
            });
      }
      const heightDiff = this.top + this.height - this.canvas.backgroundImage.height;
      if (Math.abs(heightDiff) < tolerance) {
        this.set(moving
          ? { top: this.top - heightDiff }
          : {
              fontSize: (this.height - heightDiff) / this._fontSizeMult
            });
      }
      const widthDiff = this.left + this.width - this.canvas.backgroundImage.width;
      if (Math.abs(widthDiff) < tolerance) {
        this.set(moving
          ? { left: this.left - widthDiff }
          : {
              width: this.width - widthDiff
            });
      }
    };

    obj.on('moving', (opt) => {
      const obj = opt.transform.target;
      obj.phMoving = true;

      obj.phSnapToEdge(true);
      obj.setCoords();
    });

    obj.on('mouseup', (opt) => {
      // If at end of move & auto-crop enabled, fire mousedblclick to trigger crop
      if (obj.phMoving && document.getElementById('ph-viewer-auto-crop').checked) {
        obj.fire('mousedblclick', opt);
      }
      obj.phMoving = false;
    });

    obj.on('mousedblclick', (opt) => {
      const crop = autoCrop(opt.target.canvas.backgroundImage, opt.absolutePointer.x, opt.absolutePointer.y);
      if (!crop) return;

      obj.set({
        left: crop.x1,
        top: crop.y1,
        width: crop.x2 - crop.x1,
        fontSize: ((crop.y2 - crop.y1) * (obj.scaleY || 1)) / obj._fontSizeMult
      });
      obj.setCoords();
      obj.canvas.fire('object:modified', { target: obj });
    });

    obj.on('resizing', (opt) => {
      const obj = opt.transform.target;

      // Middle-left & middle-right controls resize, not scale
      obj.phSnapToEdge();
      obj.setCoords();
    });
    obj.on('scaling', (opt) => {
      const obj = opt.transform.target;

      // Instead of scaling the text, change the fontSize to suit
      // NB: Ideally the final value of fontSize would take into account the width too, but close enough
      obj.set({
        width: obj.width * (obj.scaleX || 1),
        // NB: Set fontSize instead of height, so we size text to fit
        fontSize: (obj.height * (obj.scaleY || 1)) / obj._fontSizeMult, // Convert line height back to font size
        scaleX: 1,
        scaleY: 1
      });

      obj.phSnapToEdge();
      obj.setCoords();
    });

    this.fabCanvas.add(obj);
    return obj;
  }

  scaleLine (formInput) {
    const obj = new EditableLine({
      id: 'scale_line',
      stroke: `rgba(${rgbHighlight}, 0.6)`,
      phInvalid: {
        stroke: `rgba(${rgbInvalid}, 0.6)`
      }
    }, {
      stroke: `rgba(${rgbHighlight}, 1)`
    });

    this.fabCanvas.add(obj);
    // NB: We can't rely on timer in editable_line, so bodge here.
    obj.fire('phCanvasZoom');

    // If scale value is invalid, reset based on bacgroundImage size
    if (!validScale(
      JSON.parse(formInput.value || '[]'),
      this.fabCanvas.backgroundImage.width,
      this.fabCanvas.backgroundImage.height
    )) {
      const defScale = [
        [this.fabCanvas.backgroundImage.width / 10, this.fabCanvas.backgroundImage.height / 10],
        [this.fabCanvas.backgroundImage.width / 5, this.fabCanvas.backgroundImage.height / 10]
      ];
      formInput.value = JSON.stringify(defScale);
      obj.phSetPoints(defScale.map((p) => new fabric.Point(p[0], p[1])));
    }
    return obj;
  }

  load (blob, boundingBox) {
    return super.load(blob, boundingBox).then(() => {
    }).finally(() => { // NB: Set-up bounding box even if loading failed
      this.elementAddRemove();
    });
  }

  elementAddRemove () {
    this.fabCanvas.getObjects().forEach((o) => this.fabCanvas.remove(o));
    if (!this.fabCanvas.backgroundImage) return;

    // Add scale_line
    this.scaleLine(this.elSyncForm.elements.scale_line);

    // Find all bounding_box:* elements that aren't disabled
    const bbEls = Array.from(this.elSyncForm.elements).filter((el) => {
      return !el.disabled && el.name.match(/^bounding_box:.*$/);
    });

    // Set bounding boxes into a grid
    setInitBBs(bbEls, this.fabCanvas.backgroundImage.width, this.fabCanvas.backgroundImage.height);

    // Create canvas elements for each
    bbEls.forEach((el, i) => {
      const obj = this.boundingBox(el.name, el.getAttribute('data-label'));
      // If more than one, by default select the first
      // (otherwise leave unselected, as metadata will be shown regardless & it makes it easier to select scale line)
      if (bbEls.length > 1 && i === 0) {
        this.fabCanvas.setActiveObject(obj);
      }
      // Stack objects backwards, so scale line is on top
      this.fabCanvas.sendToBack(obj);
    });
  }
}
