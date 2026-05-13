import { Cancelled } from '../errors.js';
import { jsonFetch } from '../fetch.js';

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
    const imageId = this.imageIds[0];

    if (imageId === undefined) return Promise.resolve(null);

    return this.cancellable(jsonFetch(`/search/data?nm_image_id=${imageId}&with_associated_images=y`).then((searchData) => {
      if ((searchData.data || []).length === 0) return null;
      const imageMeta = searchData.images[imageId];

      // Fetch associated image with first row (assuming they're all the same)
      return window.fetch(imageMeta.url).then((resp) => {
        if (resp.status !== 200) {
          console.error('Failed to fetch image', resp);
          throw new Error(`Failed to fetch image ${imageMeta.url}`);
        }

        // Get image as blob, return both blob & data
        return resp.blob().then((blob) => {
          const out = { image_id: imageId, blob, individuals: searchData.data, name: `photolith:${imageId}` };

          if (searchData.data.length > 0) {
            // The name we populate the selectbar with
            out.name = searchData.data[0].ch_slideLabel;
            // The name we send on as orig_filename
            blob.name = imageMeta.orig_filename;
            out['slide-label'] = searchData.data[0].ch_slideLabel;
            out.scale_mm = imageMeta.scale_mm;
            out.scale_line = imageMeta.scale_line;
          }

          this.imageIds.shift();
          return out;
        });
      });
    }));
  }

  remaining () {
    return this.imageIds.length;
  }
}
