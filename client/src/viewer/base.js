import { fabric } from 'fabric';

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

    // Never show rotate controls on groups (read: ctrl-drag to select multiple)
    fabric.Group.prototype.lockRotation = true;

    this.fabCanvas = new fabric.Canvas(this.elViewer.querySelector(':scope > canvas.image'));
    this.fabCanvas.setWidth(this.elViewer.clientWidth);
    this.fabCanvas.setHeight(this.elViewer.clientHeight);
    // NB: Any previous height will grow the elViewer container when page is shrinking,
    //    set to absolute so it's ignored
    this.fabCanvas.upperCanvasEl.parentNode.style.position = 'absolute';

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
      // NB: Don't clear rendering if we're mid-file-load
      if (this.backgroundImage) this.upperCanvasEl.parentNode.classList.remove('rendering');
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
      // NB: Don't drag canvas on ctrl-mouse, to allow for selecting groups
      if (!opt.target && !opt.e.ctrlKey) {
        // Mouse down not on an object, drag canvas
        this.isDragging = true;
        this.selection = false;
        this.lastPoint = getEventPoint(opt.e);
      }
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

      if (this.fabCanvas.backgroundImage && blob instanceof window.Blob) {
        // Offer link directly to blob
        elDl.href = URL.createObjectURL(blob);
        elDl.download = blob.name;
      } else if (this.fabCanvas.backgroundImage) {
        // Download from canvas
        elDl.href = this.fabCanvas.backgroundImage.toDataURL({ format: 'jpeg' });
        elDl.download = blob.name + '.jpg';
      } else {
        // No image, disable download link
        elDl.href = '#';
        elDl.download = undefined;
      }
    });
  }

  startRendering () {
    this.fabCanvas.upperCanvasEl.parentNode.classList.add('rendering');
  }
}
