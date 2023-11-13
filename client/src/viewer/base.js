import { fabric } from 'fabric';
import UTIF from 'utif2';

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

function decodeTIFF (buff, fileName) {
  const ifds = UTIF.decode(buff);
  const tt = { // https://www.awaresystems.be/imaging/tiff/tifftags.html
    Compression: 't259',
    // "Old" JPEG locator fields
    JPEGInterchangeFormat: 't513',
    JPEGInterchangeFormatLength: 't514'
  };

  let selIFD = { width: 0 };
  for (const ifd of ifds) {
    // First search subIFDs for JPEGs
    let jpegBuff = { byteLength: 0 };
    for (const subIFD of ifd.subIFD || []) {
      if (subIFD[tt.Compression][0] === 6 && subIFD[tt.JPEGInterchangeFormat][0] && subIFD[tt.JPEGInterchangeFormatLength][0]) {
        // We want the biggest image, assume file size is a good proxy
        if (subIFD[tt.JPEGInterchangeFormatLength][0] > jpegBuff.byteLength) {
          jpegBuff = buff.slice(
            subIFD[tt.JPEGInterchangeFormat][0],
            subIFD[tt.JPEGInterchangeFormat][0] + subIFD[tt.JPEGInterchangeFormatLength][0]
          );
        }
      }
    }
    // If we found a JPEG, return that as a Blob
    if (jpegBuff.byteLength > 0) {
      // https://bun.sh/guides/binary/typedarray-to-blob
      return new window.Blob([jpegBuff], { type: 'image/jpeg' });
    }

    // Try decoding the IFD, see if we find a useful image
    UTIF.decodeImage(buff, ifd, ifds);
    if (ifd.width > selIFD.width) {
      selIFD = ifd;
    }
  }

  if (selIFD.width) {
    // If we found an IFD we can decode & convert to RGBA, return the imageData
    const rgba = UTIF.toRGBA8(selIFD);

    if (rgba.byteLength > 0) {
      return new window.ImageData(
        new Uint8ClampedArray(rgba.buffer),
        selIFD.width,
        selIFD.height
      );
    }
  }
  console.warn(`UTIF failed to find image in ${fileName}:`, ifds);
  throw new Error(`Could not decode ${fileName}`);
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

        this.fabCanvas.setWidth(entry.contentRect.width);
        this.fabCanvas.setHeight(entry.contentRect.height);
      });
      resizeObserver.observe(this.elViewer);
    } else {
      // Fall back to monitoring the entire window
      window.addEventListener('resize', function (event) {
        this.fabCanvas.setWidth(this.elViewer.clientWidth);
        this.fabCanvas.setHeight(this.elViewer.clientHeight);
      }.bind(this));
    }

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
    this.fabCanvas.setBackgroundImage(undefined);
    this.fabCanvas.requestRenderAll();

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
      if (!blob.arrayBuffer || !blob.name) {
        // Not really a blob (video element, e.g.)
        return window.createImageBitmap(blob);
      }
      if (blob.name.match(/\.jpe?g$/i)) {
        // JPEG can be parsed directly by createImageBitmap
        return window.createImageBitmap(blob);
      }
      return blob.arrayBuffer().then((buff) => {
        // Try decoding as TIFF/NEF, turn whatever we get back into an ImageBitmap
        return window.createImageBitmap(decodeTIFF(buff, blob.name));
      });
    }).then((imageBitmap) => {
      const img = new fabric.Image(imageBitmap, {
        selectable: false
      });
      this.fabCanvas.setBackgroundImage(img);

      // Zoom viewport to fit boundingBox, or Image
      this.fabCanvas.phFitBoundingBox(boundingBox || [[0, 0], [img.width, img.height]]);
      if (this.fabCanvas.phSetScale) this.fabCanvas.phSetScale();

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
