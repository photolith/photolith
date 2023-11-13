import UTIF from 'utif2';

export function toImageBitmap (blob) {
  if (!(blob instanceof window.Blob)) {
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
