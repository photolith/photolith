import { Canvas, FabricImage, Group } from 'fabric';

import { toImageBitmap } from '../image/decode.js';

function getEventPoint (event) {
  if (event.clientX !== undefined) {
    return { x: event.clientX, y: event.clientY };
  }
  if (event.targetTouches && event.targetTouches[0].clientX !== undefined) {
    return { x: event.targetTouches[0].clientX, y: event.targetTouches[0].clientY };
  }
  console.warn('Unknown move event', event);
  return null;
}

export class PhViewer {
  constructor (elViewer) {
    this.elViewer = elViewer;

    // Update download link with imgBlob contents
    const elDl = this.elViewer.querySelector(':scope .download-link');
    elDl.addEventListener('click', (event) => {
      if (!this.imgBlob) {
        // No image, disable download link
        elDl.href = '#';
        elDl.download = undefined;
      } else {
        // Blob download link
        elDl.href = URL.createObjectURL(this.imgBlob);
        elDl.download = this.imgBlob.name;
      }
    });

    // Never show rotate controls on groups (read: ctrl-drag to select multiple)
    Group.ownDefaults.lockRotation = true;
    Group.ownDefaults.lockScalingFlip = true;
    Group.ownDefaults.lockSkewingX = true;
    Group.ownDefaults.lockSkewingY = true;

    this.fabCanvas = new Canvas(this.elViewer.querySelector(':scope > canvas.image'));
    this.fabCanvas.phViewer = this;
    this.fabCanvas.setDimensions({
      width: this.elViewer.clientWidth,
      height: this.elViewer.clientHeight
    });
    // NB: Any previous height will grow the elViewer container when page is shrinking,
    //    set to absolute so it's ignored
    this.fabCanvas.upperCanvasEl.parentNode.style.position = 'absolute';

    this.fabCanvas.phPrefs = {};

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

      if (this.phSetScale) this.phSetScale();

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

    if (window.ResizeObserver) {
      // Monitor size of parent, resizing fabric canvas
      const resizeObserver = new window.ResizeObserver((entries) => {
        if (entries.length < 1) return;
        const entry = entries[0];

        this.fabCanvas.setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height
        });
      });
      resizeObserver.observe(this.elViewer);
    } else {
      // Fall back to monitoring the entire window
      window.addEventListener('resize', function (event) {
        this.fabCanvas.setDimensions({
          width: this.elViewer.clientWidth,
          height: this.elViewer.clientHeight
        });
      }.bind(this));
    }

    this.fabCanvas.on('after:render', function (opt) {
      // NB: Don't clear rendering if we're mid-file-load
      if (this.backgroundImage) this.upperCanvasEl.parentNode.classList.remove('rendering');
    });

    this.fabCanvas.on('mouse:wheel', function (opt) {
      // https://developer.mozilla.org/en-US/docs/Web/API/WheelEvent/deltaMode: 1 --> delta in Pixels
      const delta = opt.e.deltaMode === 1 ? opt.e.deltaY * 25 : opt.e.deltaY;
      let zoom = this.getZoom();
      zoom *= 0.999 ** delta;
      this.zoomToPoint({ x: opt.e.offsetX, y: opt.e.offsetY }, zoom);
      this.phLimitViewport();
      this.getObjects().forEach((o) => o.fire('phCanvasZoom', zoom));
      opt.e.preventDefault();
      opt.e.stopPropagation();
    });

    this.fabCanvas.on('mouse:down', function (opt) {
      // Don't drag canvas on ctrl-mouse, to allow for selecting groups
      if (opt.e.ctrlKey) return;
      // Don't drag on left button when over a target (interact with target instead)
      if (opt.e.button === 0 && opt.target) return;

      // Start canvas drag
      this.isDragging = true;
      this.selection = false;
      this.lastPoint = getEventPoint(opt.e);
    });
    this.fabCanvas.on('mouse:move', function (opt) {
      if (this.isDragging) {
        const vpt = this.viewportTransform;
        const newPoint = getEventPoint(opt.e);

        if (newPoint && this.lastPoint) {
          vpt[4] += newPoint.x - this.lastPoint.x;
          vpt[5] += newPoint.y - this.lastPoint.y;
          this.phLimitViewport();
          this.requestRenderAll();
        }

        this.lastPoint = newPoint;
      }
    });
    this.fabCanvas.on('mouse:up', function (opt) {
      // on mouse up we want to recalculate new interaction
      // for all objects, so we call setViewportTransform
      this.setViewportTransform(this.viewportTransform);
      this.isDragging = false;
      this.selection = true;
    });

    // Send object events on selection down to the children in the group
    function propogateSelectionEvents (opt) {
      const selObj = this.getActiveObject();
      if (selObj && selObj instanceof Group) {
        selObj.on('moving', function (opt) {
          selObj.getObjects().forEach((o) => {
            o.fire('moving', { e: opt.e, pointer: opt.pointer, transform: { target: o } });
          });
        });
        // NB: resizing won't be a thing, it only happens on a textbox for reflowing content
        selObj.on('scaling', function (opt) {
          // Remove activeSelection's scale, apply it to each object and let it deal with it
          const oldScaleX = selObj.scaleX || 1;
          const oldScaleY = selObj.scaleY || 1;
          selObj.set({
            width: selObj.width * oldScaleX,
            height: selObj.height * oldScaleY,
            scaleX: 1,
            scaleY: 1
          });
          selObj.getObjects().forEach((o) => {
            o.set({
              left: o.left * oldScaleX,
              top: o.top * oldScaleY,
              scaleX: o.scaleX * oldScaleX,
              scaleY: o.scaleY * oldScaleY
            });
            o.setCoords();
            o.fire('scaling', { e: opt.e, pointer: opt.pointer, transform: { target: o } });
          });
        });
        selObj.on('modified', function (opt) {
          selObj.getObjects().forEach((o) => {
            o.canvas.fire('object:modified', { target: o });
          });
        });
      }
    }
    this.fabCanvas.on('selection:created', propogateSelectionEvents);
    this.fabCanvas.on('selection:updated', propogateSelectionEvents);
    this.fabCanvas.on('selection:deleted', propogateSelectionEvents);
  }

  configureScale (scaleEl) {
    this.fabCanvas.phSetScale = undefined;
    if (!scaleEl) return;
    const mmToPx = parseFloat(scaleEl.getAttribute('data-mm-to-px'));
    if (isNaN(mmToPx)) return;

    const innerEl = scaleEl.firstElementChild;
    this.fabCanvas.phSetScale = function () {
      const mmToBrowserPx = mmToPx * this.getZoom();

      let mmDisplay = 1;
      if (scaleEl.clientWidth) {
        // Work out scale unit that makes the inner fit the space
        mmDisplay = scaleEl.clientWidth / (20 * mmToBrowserPx);
        // Round to nearest power-of-10
        mmDisplay = Math.pow(10, Math.ceil(Math.log10(mmDisplay)));
      }

      scaleEl.classList.remove('d-none');
      // NB: innerEl has 20 segments (as each is 5% in viewer.css)
      innerEl.style.width = (mmToBrowserPx * mmDisplay * 20) + 'px';
      innerEl.textContent = mmDisplay + 'mm';
    };
  }

  load (blob, boundingBox) {
    this.fabCanvas.backgroundImage = undefined;
    this.fabCanvas.requestRenderAll();
    this.imgBlob = null;

    if (blob === 'start_load') {
      // Not a blob, indication we should start spinner
      this.startRendering();
      return Promise.resolve();
    }
    if (!blob) {
      // Clearing any existing image, stop rendering
      this.fabCanvas.upperCanvasEl.parentNode.classList.remove('rendering');
      return Promise.resolve();
    }

    return Promise.resolve().then(() => {
      return toImageBitmap(blob);
    }).then((imageBitmap) => {
      const img = new FabricImage(imageBitmap, {
        selectable: false
      });
      this.fabCanvas.backgroundImage = img;
      // 7.0+ defaults to originX/originY default to 'center'
      // 8.0+ gets rid of the originX/originY backward compatibility options
      // https://fabricjs.com/docs/upgrading/upgrading-to-fabric-70/#warning-objectoriginx-and-objectoriginy-now-default-to-center
      img.setPositionByOrigin({ x: 0, y: 0 }, 'left', 'top');

      // Zoom viewport to fit boundingBox, or Image
      this.fabCanvas.phFitBoundingBox(boundingBox || [[0, 0], [img.width, img.height]]);
      if (this.fabCanvas.phSetScale) this.fabCanvas.phSetScale();

      this.refreshFilters();

      // Set imgBlob, converting canvas content if load() input wasn't blobby enough
      if (blob instanceof window.Blob) {
        this.imgBlob = blob;
      } else {
        return new Promise((resolve) => {
          img.toCanvasElement().toBlob(resolve, 'image/jpeg', 0.9);
        }).then((newBlob) => {
          this.imgBlob = newBlob;
          this.imgBlob.name = blob.name;
        });
      }
    });
  }

  startRendering () {
    this.fabCanvas.upperCanvasEl.parentNode.classList.add('rendering');
  }
}
