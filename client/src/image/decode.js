import UTIF from 'utif2';

export function toImageBitmap (blob) {
  // Try creating bitmap, should work for video elements, JPEG blobs, etc.
  // https://developer.mozilla.org/en-US/docs/Web/API/Window/createImageBitmap
  return window.createImageBitmap(blob).catch((err) => {
    console.warn(`createImageBitmap on ${blob.name} failed:`, err);

    // Try decoding as TIFF/NEF, turn whatever we get back into an ImageBitmap
    return blob.arrayBuffer().then((buff) => {
      return window.createImageBitmap(decodeTIFF(buff, blob.name));
    });
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

  // First value of tag (t) in (ifd), NB: tags not present in the file are missing entirely
  const tag = (ifd, t) => (ifd[t] || [])[0];

  let selIFD = { width: 0 };
  for (const ifd of ifds) {
    // First search subIFDs for JPEGs
    let jpegBuff = { byteLength: 0 };
    for (const subIFD of ifd.subIFD || []) {
      const offset = tag(subIFD, tt.JPEGInterchangeFormat);
      const length = tag(subIFD, tt.JPEGInterchangeFormatLength);
      if (tag(subIFD, tt.Compression) === 6 && offset && length) {
        // We want the biggest image, assume file size is a good proxy
        if (length > jpegBuff.byteLength) {
          jpegBuff = buff.slice(offset, offset + length);
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
