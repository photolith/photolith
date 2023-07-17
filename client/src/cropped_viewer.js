export function init (parent) {
  parent.querySelectorAll('div.ph-cropped-viewer').forEach((elViewer) => {
    elViewer.innerHTML = '<canvas style="max-width: 100%; max-height: 100%;">';
    const elImage = new window.Image();
    const elCanvas = elViewer.firstChild;
    const href = elViewer.getAttribute('data-src');
    const boundingBox = JSON.parse(elViewer.getAttribute('data-bounding-box'));

    elViewer.setAttribute('class', 'ph-cropped-viewer rendering');

    // Size canvas to natural size of cropped area (CSS will worry about scaling)
    elCanvas.width = boundingBox[1][0] - boundingBox[0][0];
    elCanvas.height = boundingBox[1][1] - boundingBox[0][1];

    elImage.onload = (e) => {
      const ctx = elCanvas.getContext('2d');
      ctx.drawImage(
        elImage,
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
      elImage.src = '';
      elViewer.classList.remove('rendering');
    };
    elImage.src = href;
  });
}
