import { Cancelled } from '../errors.js';
import { blobFetch, jsonFetch } from '../fetch.js';

export class PhotolithFileSet {
  /**
    * imageLocationsJson - JSON-encoded array of { url, name }
    */
  constructor (imageIdString) {
    this.imageIds = imageIdString.split(',').map((x) => parseInt(x, 10));
    this.name = `photolith:${this.imageIds.join(',')}`;
    this.prev = null;
  }

  close () {
    this._remaining = undefined;
    this.cancel();
  }

  cancellable (p) {
    this.cancel();
    return Promise.race([p, new Promise((resolve, reject) => {
      this.reject = reject;
    })]);
  }

  cancel () {
    if (this.reject) {
      this.reject(new Cancelled());
      this.reject = undefined;
    }
  }

  next (overridePrev) {
    if (this.imageIds[0] === undefined) return Promise.resolve(null);
    return this.cancellable(this._fetchNext());
  }

  _fetchNext () {
    const imageId = this.imageIds[0];

    if (imageId === undefined) return Promise.resolve(null);

    return jsonFetch(`/search/data?nm_image_id=${imageId}&with_associated_images=y&with_annotations=alert`).then((searchData) => {
      if ((searchData.data || []).length === 0) {
        // No individuals (so no image URL either), nothing to ingest. Skip on to the next image
        this.imageIds.shift();
        return this._fetchNext();
      }
      const imageMeta = searchData.images[imageId];

      // Fetch associated image with first row (assuming they're all the same)
      return blobFetch(imageMeta.url).then((blob) => {
        // Return both blob & data
        const out = {
          image_id: imageId,
          blob,
          individuals: searchData.data,
          // The name we populate the selectbar with
          name: searchData.data[0].ch_slideLabel,
          'slide-label': searchData.data[0].ch_slideLabel,
          scale_mm: imageMeta.scale_mm,
          scale_line: imageMeta.scale_line
        };
        // The name we send on as orig_filename
        blob.name = imageMeta.orig_filename;

        this.imageIds.shift();
        return out;
      });
    });
  }

  remaining () {
    return this.imageIds.length;
  }
}
