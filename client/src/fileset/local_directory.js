import { Cancelled } from '../errors';

export class LocalDirectoryFileSet {
  constructor () {
    this.name = 'localdirselect:';
    this._dirHandle = null;
    this._dirNames = [];
    this._dirVisited = new Set();
  }

  close () {
    if (this.reject) this.reject(new Cancelled());
    this._dirHandle = null;
    this._dirVisited = new Set();
  }

  next () {
    if (!window.showDirectoryPicker) {
      window.alert('Your browser does not support selecting by directory, use the file picker instead');
      return Promise.reject(new Cancelled('showDirectoryPicker not supported'));
    }

    return new Promise((resolve, reject) => {
      // Stop any previous promises, assume it's been closed now
      if (this.reject) this.reject(new Cancelled());
      this.reject = reject;

      Promise.resolve().then(() => {
        return this._dirHandle || window.showDirectoryPicker();
      }).then((dirHandle) => {
        this._dirHandle = dirHandle;
        const entries = this._dirHandle.entries();
        const out = [];

        // Recursively wait for the next entry in entries()
        const process = (e) => {
          // NB: e.value is ['fname', FileSystemFileHandle]
          if (e.value && e.value[1].kind === 'file' && !this._dirVisited.has(e.value[0])) out.push(e.value[0]);
          if (e.done) return out;
          return entries.next().then(process);
        };

        return process({ done: false });
      }).then((entries) => {
        this._remaining = Math.max(entries.length - 1, 0);
        if (entries.length === 0) return null;

        entries.sort();
        this._dirVisited.add(entries[0]);
        return this._dirHandle.getFileHandle(entries[0]).then((fh) => fh.getFile());
      }).then(resolve).catch(reject);
    });
  }

  remaining () {
    return this._remaining || 0;
  }
}
