import { Cancelled } from '../errors';

export class LocalFileSet {
  constructor () {
    this.name = 'fileselect:';
    this.input = document.createElement('input');
    this.input.type = 'file';
    this.input.multiple = true;
    this.input.accept = 'image/*';
  }

  close () {
    if (this.reject) this.reject(new Cancelled());
    this._remaining = undefined;
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
      this._remaining = files.length - 1;
      return files.shift();
    });
  }

  remaining () {
    return this._remaining;
  }
}
