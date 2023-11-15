import { parse } from 'content-disposition-header';

import { displayAlert } from '../alert';
import { Cancelled } from '../errors';

function timedPromise (rv, timeout) {
  return new Promise((resolve) => window.setTimeout(resolve.bind(null, rv), timeout));
}

export class ServerFileSet {
  constructor (photoDir) {
    this.name = `server:${photoDir}:`;
    this.photoDir = photoDir;
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
    const url = `/ingest/next-photo/${this.photoDir}/?prev=${overridePrev !== undefined ? (overridePrev || '') : this.prev ? this.prev : ''}`;
    return this.cancellable(window.fetch(url)).then((resp) => {
      this._remaining = parseInt(resp.headers.get('X-Photolith-Remaining') || 0, 10);

      if (resp.status === 204) {
        return null;
      }
      if (resp.status === 400 && resp.headers.get('Content-Type') === 'text/plain') {
        return resp.text().then((text) => {
          const oldPrev = this.prev;

          this.prev = resp.headers.get('X-Photolith-Name');
          if (overridePrev === undefined && text.match(/truncated/i)) {
            displayAlert('warning', text + ', waiting 5s and retrying...');
            return this.cancellable(timedPromise(true, 5000)).then(this.next.bind(this, oldPrev));
          }
          throw new Error('Failed to fetch next image: ' + text);
        });
      }
      if (resp.status === 200) {
        return resp.blob().then((blob) => {
          try {
            blob.name = parse(resp.headers.get('Content-Disposition')).parameters.filename;
          } catch (e) {
            console.warn(`Could not parse Content-Disposition: '${resp.headers.get('Content-Disposition')}'`);
            blob.name = 'unknown.jpg';
          }
          this.prev = blob.name;
          return blob;
        });
      }
      console.error('Failed to fetch next image', resp);
      throw new Error('Failed to fetch next image');
    });
  }

  remaining () {
    return this._remaining;
  }
}
