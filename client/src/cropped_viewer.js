export function croppedImageViewer (href, boundingBox, canvasStyle) {
  const elCanvas = document.createElement('CANVAS');
  const elImage = new window.Image();

  elCanvas.setAttribute('style', canvasStyle || '');

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
  };
  elImage.src = href;

  return elCanvas;
}
