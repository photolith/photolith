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
    const ctx = this.elCanvas.getContext('2d');

    if (this.elCanvas.width * this.zoom > this.image.width) {
      // Image smaller than canvas, switch around logic
      if (this.offsetX < 0) {
        this.offsetX = 0;
      } else if (this.elCanvas.width * this.zoom - this.offsetX < this.image.width) {
        this.offsetX = this.elCanvas.width * this.zoom - this.image.width;
      }
    } else if (this.offsetX >= 0) {
      this.offsetX = 0;
    } else if (this.elCanvas.width * this.zoom - this.offsetX > this.image.width) {
      this.offsetX = this.elCanvas.width * this.zoom - this.image.width;
    }
    if (this.elCanvas.height * this.zoom > this.image.height) {
      // Image smaller than canvas, switch around logic
      if (this.offsetY < 0) {
        this.offsetY = 0;
      } else if (this.elCanvas.height * this.zoom - this.offsetY < this.image.height) {
        this.offsetY = this.elCanvas.height * this.zoom - this.image.width;
      }
    } else if (this.offsetY >= 0) {
      this.offsetY = 0;
    } else if (this.elCanvas.height * this.zoom - this.offsetY > this.image.height) {
      this.offsetY = this.elCanvas.height * this.zoom - this.image.height;
    }

    ctx.clearRect(0, 0, this.elCanvas.width, this.elCanvas.height);
    if (!this.image) return;
    ctx.drawImage(
      this.image,
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
  }

  load (f) {
    return new Promise((resolve) => {
      const reader = new window.FileReader();

      this.image = new window.Image();
      this.image.onload = (e) => {
        this.setOffset(0, 0, this.image.width / this.elCanvas.width);
        this.redraw();
        resolve();
      };

      // Load file into Image
      reader.onload = (e) => { this.image.src = e.target.result; };
      reader.readAsDataURL(f);
    });
  }
}

export function init (window) {
  window.document.querySelectorAll('div.ph-viewer').forEach((elViewer) => {
    elViewer.innerHTML = `
      <canvas class="image"></canvas>
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
