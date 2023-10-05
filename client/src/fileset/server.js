import { parse } from 'content-disposition-header';

import { displayAlert } from '../alert';

function timedPromise (rv, timeout) {
  return new Promise((resolve) => window.setTimeout(resolve.bind(null, rv), timeout));
}

export class ServerFileSet {
  constructor (photoDir) {
    this.name = `server:${photoDir}:`;
    this.photoDir = photoDir;
    this.prev = null;
  }

  close () { }

  next (retrying) {
    const url = `/ingest/next-photo/${this.photoDir}/${this.prev ? '?prev=' + this.prev : ''}`;
    return window.fetch(url).then((resp) => {
      const remaining = parseInt(resp.headers.get('X-Photolith-Remaining') || 0, 10);

      if (resp.status === 204) {
        return { f: null, remaining: remaining };
      }
      if (resp.status === 400 && resp.headers.get('Content-Type') === 'text/plain') {
        return resp.text().then((text) => {
          if (!retrying && text.indexOf('truncated') > -1) {
            displayAlert('warning', text + ', waiting 5s and retrying...');
            return timedPromise(true, 5000).then(this.next.bind(this));
          }
          this.prev = resp.headers.get('X-Photolith-Name');
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
          return { f: blob, remaining: remaining };
        });
      }
      console.error('Failed to fetch next image', resp);
      throw new Error('Failed to fetch next image');
    });
  }
}
