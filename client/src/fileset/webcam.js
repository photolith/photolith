import { Cancelled } from '../errors';

// https://developer.mozilla.org/en-US/docs/Web/API/Media_Capture_and_Streams_API/Taking_still_photos
// https://developer.mozilla.org/en-US/docs/Web/API/MediaStream

export class WebcamFileSet {
  constructor (deviceId) {
    this.name = 'webcam:';
    this.elViewer = window.document.querySelector('.ph-viewer');
    this.deviceId = deviceId || undefined;
  }

  updateSelectDevices () {
    const elSelect = window.document.querySelector('.ph-ingest-select-bar select');
    const webcamOpts = Array.from(elSelect.options).filter((o) => o.value.startsWith(this.name));

    // Only add options once
    if (webcamOpts.length > 1) return;

    // NB: We can't do this until at least one camera is opened, so we have to bodge it after the first open:
    //     https://github.com/w3c/mediacapture-main/issues/874
    navigator.mediaDevices.enumerateDevices().then((devices) => devices.forEach((device) => {
      if (device.kind === 'videoinput') {
        elSelect.appendChild(new window.Option(
          webcamOpts[0].textContent.replace(/\(.*\)$/, '(' + device.label + ')'),
          this.name + device.deviceId
        ));
      }
    }));
  }

  close () {
    if (this.reject) this.reject(new Cancelled());
    this.video.srcObject.getTracks().forEach((t) => { t.stop(); });
    this.elViewer.removeChild(this.video);
    this.video = null;
  }

  next () {
    return Promise.resolve().then(() => {
      // Already have a video, keep using existing video
      if (this.video) return;

      // Open a new video stream
      return navigator.mediaDevices.getUserMedia({ video: { deviceId: this.deviceId, facingMode: 'environment' } }).then((stream) => {
        this.video = document.createElement('VIDEO');
        this.video.name = stream.getVideoTracks()[0].label; // NB: So we can later extract a filename from the element
        this.video.setAttribute('style', this.elViewer.querySelector(':scope>.canvas-container').getAttribute('style'));
        this.video.style.display = 'none';
        this.video.srcObject = stream;
        this.elViewer.appendChild(this.video);

        this.updateSelectDevices();
      });
    }).then(() => {
      // Start video and wait for user to take photo
      return new Promise((resolve, reject) => {
        this.video.style.display = '';
        this.video.play();
        this.video.onclick = resolve.bind(null, null);
        this.reject = reject;
      });
    }).then(() => {
      this.video.pause();
      // NB: Can be anything createImageBitmap supports: https://developer.mozilla.org/en-US/docs/Web/API/CreateImageBitmap
      return this.video;
    }).finally(() => {
      // Hide video object, view canvas underneath
      if (this.video) { // NB: close() might have destroyed it already
        this.video.pause();
        this.video.style.display = 'none';
      }
    });
  }

  remaining () {
    return this._remaining;
  }
}
