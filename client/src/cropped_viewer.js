import { blobFetch } from './fetch.js';
import { toImageBitmap } from './image.js';

export function init (parent) {
  parent.querySelectorAll('div.ph-cropped-viewer').forEach((elViewer) => {
    elViewer.innerHTML = '<canvas style="max-width: 100%; max-height: 100%;">';
    const elCanvas = elViewer.firstChild;
    const boundingBox = JSON.parse(elViewer.getAttribute('data-bounding-box'));

    elViewer.setAttribute('class', 'ph-cropped-viewer rendering');

    // Size canvas to natural size of cropped area (CSS will worry about scaling)
    elCanvas.width = boundingBox[1][0] - boundingBox[0][0];
    elCanvas.height = boundingBox[1][1] - boundingBox[0][1];

    return blobFetch(elViewer.getAttribute('data-src')).then((blob) => {
      return toImageBitmap(blob);
    }).then((imageBitmap) => {
      const ctx = elCanvas.getContext('2d');
      ctx.drawImage(
        imageBitmap,
        // Top-left of source image
        boundingBox[0][0],
        boundingBox[0][1],
        // W/H to extract from source image
        elCanvas.width,
        elCanvas.height,
        // Top-left of destination in canvas
        0,
        0,
        // W/H of destination in canvas
        elCanvas.width,
        elCanvas.height
      );
      elViewer.classList.remove('rendering');
    });
  });
}
