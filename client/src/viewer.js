class PhViewer {
  constructor (elViewer) {
    this.elViewer = elViewer;
    elViewer.phViewer = this;
    this.elCanvas = this.elViewer.querySelector(':scope > canvas.image');
    this.setOffset();
  }

  setOffset (x = 0, y = 0, z = 1) {
    this.elCanvas.width = this.elCanvas.clientWidth;
    this.elCanvas.height = this.elCanvas.clientHeight;
    // Ratio image pixels <-> canvas pixels
    this.zoom = z;
    // Offset of top-left corner, in image pixels
    this.offsetX = x * this.zoom;
    // Offset of top-left corner, in image pixels
    this.offsetY = y * this.zoom;
  }

  pan (deltaX, deltaY) {
    this.offsetX -= deltaX * this.zoom;
    this.offsetY -= deltaY * this.zoom;
    this.redraw();
  }

  zoomPoint (originX, originY, deltaZ) {
    const oldZoom = this.zoom;
    this.zoom /= deltaZ;
    // Add the difference in zoom origin at new zoom level to the offset, so it stays in the same place relative to canvas
    this.offsetX += originX * this.zoom - originX * oldZoom;
    this.offsetY += originY * this.zoom - originY * oldZoom;
    this.redraw();
  }

  redraw () {
    return this.rerender().then((image) => {
      if (!image) return;

      if (this.elCanvas.width * this.zoom > image.width) {
        // Image smaller than canvas, switch around logic
        if (this.offsetX < 0) {
          this.offsetX = 0;
        } else if (this.elCanvas.width * this.zoom - this.offsetX < image.width) {
          this.offsetX = this.elCanvas.width * this.zoom - image.width;
        }
      } else if (this.offsetX >= 0) {
        this.offsetX = 0;
      } else if (this.elCanvas.width * this.zoom - this.offsetX > image.width) {
        this.offsetX = this.elCanvas.width * this.zoom - image.width;
      }
      if (this.elCanvas.height * this.zoom > image.height) {
        // Image smaller than canvas, switch around logic
        if (this.offsetY < 0) {
          this.offsetY = 0;
        } else if (this.elCanvas.height * this.zoom - this.offsetY < image.height) {
          this.offsetY = this.elCanvas.height * this.zoom - image.width;
        }
      } else if (this.offsetY >= 0) {
        this.offsetY = 0;
      } else if (this.elCanvas.height * this.zoom - this.offsetY > image.height) {
        this.offsetY = this.elCanvas.height * this.zoom - image.height;
      }

      const ctx = this.elCanvas.getContext('2d');
      ctx.clearRect(0, 0, this.elCanvas.width, this.elCanvas.height);
      ctx.drawImage(
        image,
        // Top-left of source image
        0 - this.offsetX,
        0 - this.offsetY,
        // W/H to extract from source image
        this.elCanvas.width * this.zoom,
        this.elCanvas.height * this.zoom,
        // Top-left of destination in canvas
        0,
        0,
        // W/H of destination in canvas
        this.elCanvas.width,
        this.elCanvas.height);
    });
  }

  rerender () {
    // converts a cv.Mat into imageData (i.e. the guts of imshow)
    function imageDataFromMat (cv, mat) {
      const img = new cv.Mat();
      const depth = mat.type() % 8;
      const scale =
        depth <= cv.CV_8S ? 1.0 : depth <= cv.CV_32S ? 1.0 / 256.0 : 255.0;
      const shift = depth === cv.CV_8S || depth === cv.CV_16S ? 128.0 : 0.0;
      mat.convertTo(img, cv.CV_8U, scale, shift);

      // converts the img type to cv.CV_8UC4
      switch (img.type()) {
        case cv.CV_8UC1:
          cv.cvtColor(img, img, cv.COLOR_GRAY2RGBA);
          break;
        case cv.CV_8UC3:
          cv.cvtColor(img, img, cv.COLOR_RGB2RGBA);
          break;
        case cv.CV_8UC4:
          break;
        default:
          throw new Error(
            'Bad number of channels (Source image must have 1, 3 or 4 channels)'
          );
      }
      const clampedArray = new window.ImageData(
        new Uint8ClampedArray(img.data),
        img.cols,
        img.rows
      );
      img.delete();
      return clampedArray;
    }

    // Convert a Bitmap object to ImageData by drawing on a temporary canvas
    function bitmapToImageData (bitmap) {
      // NB: This is convoluted, but the current way to do it:
      //     https://github.com/whatwg/html/issues/4785
      const canvas = new window.OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0);
      return ctx.getImageData(0, 0, canvas.width, canvas.height);
    }

    const transforms = this.readTransforms();
    const cv = window.cv;

    // If nothing to do, resolve immediately with bitmap
    if (!this.origImage) return Promise.resolve(undefined);
    if (this.tformedBitmap) return Promise.resolve(this.tformedBitmap);

    // If no transforms, output ImageBitmap is same as input ImageData
    if (Object.keys(transforms).length === 0) {
      if (this.origImage instanceof window.ImageBitmap) {
        return Promise.resolve(this.origImage);
      }
      if (this.origImage instanceof window.ImageData) {
        // Turn ImageData into an ImageBitmap for rendering
        return window.createImageBitmap(this.origImage).then((bitmap) => {
          if (this.tformedBitmap) this.tformedBitmap.close();
          this.tformedBitmap = bitmap;
          return this.tformedBitmap;
        });
      }
      throw new Error('Unknown origImage type');
    }

    // this.origImage has to be ImageData before proceeding
    if (this.origImage instanceof window.ImageBitmap) {
      const data = bitmapToImageData(this.origImage);
      this.origImage.close();
      this.origImage = data;
    }

    // Generate cvMat of original image
    const cvMat = cv.matFromImageData(this.origImage);
    try {
      if (transforms.equalize) {
        cv.cvtColor(cvMat, cvMat, cv.COLOR_RGBA2GRAY, 0);
        cv.equalizeHist(cvMat, cvMat);
      }
      if (transforms.canny) {
        cv.Canny(cvMat, cvMat, 50, 100, 3, false);
      }
      return window.createImageBitmap(imageDataFromMat(cv, cvMat)).then((bitmap) => {
        if (this.tformedBitmap) this.tformedBitmap.close();
        this.tformedBitmap = bitmap;
        return this.tformedBitmap;
      });
    } catch (error) {
      console.error(error);
      throw cv.exceptionFromPtr(error).msg;
    } finally {
      cvMat.delete();
    }
  }

  readTransforms () {
    const transforms = window.transforms || {};
    const transformsString = JSON.stringify(transforms);

    if (this.prevTransforms !== transformsString) {
      // If transform string changed, invalidate transformed bitmap
      if (this.tformedBitmap) this.tformedBitmap.close();
      this.tformedBitmap = undefined;
    }
    this.prevTransforms = transformsString;
    return transforms;
  }

  load (blob) {
    return window.createImageBitmap(blob).then((origBitmap) => {
      if (this.origImage instanceof window.ImageData) this.origImage.close();
      if (this.tformedBitmap instanceof window.ImageData) this.tformedBitmap.close();

      // NB: origImage starts off as an ImageBitmap until we need an ImageData
      this.origImage = origBitmap;
      this.tformedBitmap = undefined;
      this.setOffset(0, 0, origBitmap.width / this.elCanvas.width);
      return this.redraw();
    });
  }
}

export function init (window) {
  window.document.querySelectorAll('div.ph-viewer').forEach((elViewer) => {
    elViewer.innerHTML = `
      <canvas class="image"></canvas>
      <div class="dropdown">
        <button class="btn btn-secondary dropdown-toggle" type="button" id="ph-viewer-dropdown-button" data-bs-toggle="dropdown" aria-expanded="false">
          <!-- https://icons.getbootstrap.com/icons/magic/ -->
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-magic" viewBox="0 0 16 16">
            <path d="M9.5 2.672a.5.5 0 1 0 1 0V.843a.5.5 0 0 0-1 0v1.829Zm4.5.035A.5.5 0 0 0 13.293 2L12 3.293a.5.5 0 1 0 .707.707L14 2.707ZM7.293 4A.5.5 0 1 0 8 3.293L6.707 2A.5.5 0 0 0 6 2.707L7.293 4Zm-.621 2.5a.5.5 0 1 0 0-1H4.843a.5.5 0 1 0 0 1h1.829Zm8.485 0a.5.5 0 1 0 0-1h-1.829a.5.5 0 0 0 0 1h1.829ZM13.293 10A.5.5 0 1 0 14 9.293L12.707 8a.5.5 0 1 0-.707.707L13.293 10ZM9.5 11.157a.5.5 0 0 0 1 0V9.328a.5.5 0 0 0-1 0v1.829Zm1.854-5.097a.5.5 0 0 0 0-.706l-.708-.708a.5.5 0 0 0-.707 0L8.646 5.94a.5.5 0 0 0 0 .707l.708.708a.5.5 0 0 0 .707 0l1.293-1.293Zm-3 3a.5.5 0 0 0 0-.706l-.708-.708a.5.5 0 0 0-.707 0L.646 13.94a.5.5 0 0 0 0 .707l.708.708a.5.5 0 0 0 .707 0L8.354 9.06Z"/>
          </svg>
        </button>
        <ul class="dropdown-menu" aria-labelledby="ph-viewer-dropdown-button">
        </ul>
      </div>
    `;
    const elCanvas = elViewer.querySelector(':scope > canvas.image');
    const phViewer = new PhViewer(elViewer);

    const interactState = { mouseDown: false, x: 0, y: 0 };
    elCanvas.addEventListener('mousedown', (event) => {
      interactState.mouseDown = true;
      interactState.x = event.clientX;
      interactState.y = event.clientY;
    });
    elCanvas.addEventListener('mouseup', (event) => {
      interactState.mouseDown = false;
    });
    elCanvas.addEventListener('mousemove', (event) => {
      if (!interactState.mouseDown) return;
      phViewer.pan(interactState.x - event.clientX, interactState.y - event.clientY);
      interactState.x = event.clientX;
      interactState.y = event.clientY;
    });
    elCanvas.addEventListener('mouseout', (event) => {
      interactState.mouseDown = false;
    });
    elCanvas.addEventListener('mousewheel', (event) => {
      phViewer.zoomPoint(event.offsetX, event.offsetY, event.deltaY > 0 ? 0.9 : 1 / 0.9);
    });

    elCanvas.addEventListener('touchstart', (event) => {
      if (event.touches.length === 2) {
        const rect = elCanvas.getBoundingClientRect();
        interactState.x = (event.touches[0].pageX + event.touches[1].pageX - rect.left * 2) / 2;
        interactState.y = (event.touches[0].pageY + event.touches[1].pageY - rect.top * 2) / 2;
        interactState.lastTouchDist = Math.hypot(
          event.touches[0].pageX - event.touches[1].pageX,
          event.touches[0].pageY - event.touches[1].pageY);
      } else if (event.touches.length === 1) {
        interactState.x = event.touches[0].pageX;
        interactState.y = event.touches[0].pageY;
      }
    });
    elCanvas.addEventListener('touchmove', (event) => {
      if (event.touches.length === 2) {
        phViewer.zoomPoint(
          interactState.x,
          interactState.y,
          // Zoom by ratio of touch distance to previous touch distance
          Math.hypot(
            event.touches[0].pageX - event.touches[1].pageX,
            event.touches[0].pageY - event.touches[1].pageY
          ) / interactState.lastTouchDist);
        interactState.lastTouchDist = Math.hypot(
          event.touches[0].pageX - event.touches[1].pageX,
          event.touches[0].pageY - event.touches[1].pageY);
      } else if (event.touches.length === 1) {
        phViewer.pan(interactState.x - event.touches[0].pageX, interactState.y - event.touches[0].pageY);
        interactState.x = event.touches[0].pageX;
        interactState.y = event.touches[0].pageY;
      }
    });
  });
}
