import { parse } from 'content-disposition-header';

export class ServerFileSet {
  constructor (photoDir) {
    this.name = `server:${photoDir}:`;
    this.photoDir = photoDir;
    this.prev = null;
  }

  close () { }

  next () {
    const url = `/ingest/next-photo/${this.photoDir}/${this.prev ? '?prev=' + this.prev : ''}`;
    return window.fetch(url).then((resp) => {
      const remaining = parseInt(resp.headers.get('X-Photolith-Remaining') || 0, 10);

      if (resp.status === 204) {
        return { f: null, remaining: remaining };
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
