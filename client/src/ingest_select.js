import { parse } from 'content-disposition-header';

import { changeEvent } from './events';

class Cancelled extends Error { }

class NullFileSet {
  constructor () {
    this.name = 'null:';
  }

  next () {
    return Promise.resolve({ f: null, remaining: 0 });
  }

  close () { }
}

class LocalFileSet {
  constructor () {
    this.name = 'fileselect:';
    this.input = document.createElement('input');
    this.input.type = 'file';
    this.input.multiple = true;
    this.input.accept = 'image/*';
  }

  close () {
    if (this.reject) this.reject(new Cancelled());
  }

  next () {
    return new Promise((resolve, reject) => {
      // Keep returning previously selected files
      if (this.files && this.files.length > 0) return resolve(this.files);

      // Stop any previous promises, assume it's been closed now
      if (this.reject) this.reject(new Cancelled());
      this.reject = reject;

      // Open dialog, return any files selected
      this.input.onchange = (e) => {
        // Previously selected files, pressed cancel.
        if (e.target.files.length === 0) reject(new Cancelled());
        this.files = Array.from(e.target.files);
        resolve(this.files);
      };
      this.input.click();
    }).then((files) => {
      return { f: files.shift(), remaining: files.length };
    });
  }
}

class ServerFileSet {
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

function newFileSet (val) {
  val = val.split(':');

  if (val[0] === 'null') return new NullFileSet();
  if (val[0] === 'fileselect') return new LocalFileSet();
  if (val[0] === 'server') return new ServerFileSet(val[1]);
  throw new Error('Unknown select type ' + val.join(':'));
}

function nextSelection (elSelect) {
  const elSyncForm = window.document.querySelector(elSelect.getAttribute('data-sync-form'));

  elSyncForm.image_file.value = '';
  elSyncForm.image_file.phBlob = null;
  elSyncForm.image_file.dispatchEvent(changeEvent());

  return elSelect.fs.next().then(({ f = null, remaining = 0 }) => {
    if (!elSelect.options[0].phOrigText) elSelect.options[0].phOrigText = elSelect.options[0].text;

    if (f) {
      elSelect.options[0].text = `[ ${f.name}${remaining > 0 ? `, +${remaining}...` : ''} ]`;
    } else {
      elSelect.options[0].text = elSelect.options[0].phOrigText;
    }

    elSyncForm.image_file.value = elSelect.fs.name;
    elSyncForm.image_file.phBlob = f;
    elSyncForm.image_file.dispatchEvent(changeEvent());
  }).catch((err) => {
    if (err instanceof Cancelled) {
      // File select cancelled, don't change anything.
      return;
    }
    throw err;
  });
}

export function init (parent) {
  parent.querySelectorAll('.ph-ingest-select').forEach((elIngestSelect) => {
    const elSelect = elIngestSelect.querySelector(':scope select');

    elSelect.fs = newFileSet('null');

    elSelect.addEventListener('change', (event) => {
      if (elSelect.fs) elSelect.fs.close();
      elSelect.fs = newFileSet(elSelect.value);
      elSelect.selectedIndex = 0;
      nextSelection(elSelect);
    });

    elIngestSelect.querySelector(':scope *[data-action=next]').addEventListener('click', (event) => {
      event.preventDefault();
      nextSelection(elSelect);
    });
  });
}
