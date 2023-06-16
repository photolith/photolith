class Cancelled extends Error { }

class NullFileSet {
  next () {
    return Promise.resolve({ f: null, remaining: 0 });
  }

  close () { }
}

class LocalFileSet {
  constructor () {
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

function newFileSet (val) {
  val = val.split(':');

  if (val[0] === 'null') return new NullFileSet();
  if (val[0] === 'fileselect') return new LocalFileSet();
  throw new Error('Unknown select type ' + val.join(':'));
}

function nextSelection (elSelect, phViewer) {
  return elSelect.fs.next().then(({ f = null, remaining = 0 }) => {
    if (!elSelect.options[0].phOrigText) elSelect.options[0].phOrigText = elSelect.options[0].text;

    if (f) {
      elSelect.options[0].text = `[ ${f.name}${remaining > 0 ? `, +${remaining}...` : ''} ]`;
    } else {
      elSelect.options[0].text = elSelect.options[0].phOrigText;
    }
    phViewer.load(f); // NB: If null will unload image
  }).catch((err) => {
    if (err instanceof Cancelled) {
      // File select cancelled, don't change anything.
      return;
    }
    throw err;
  });
}

export function init (window) {
  window.document.querySelectorAll('.ph-ingest-select').forEach((elIngestSelect) => {
    const elSelect = elIngestSelect.querySelector(':scope select');
    const elViewer = window.document.querySelector(elIngestSelect.getAttribute('data-viewer'));
    const elNextButton = elIngestSelect.querySelector(':scope .ph-ingest-next');

    elSelect.fs = newFileSet('null');

    elSelect.addEventListener('change', (event) => {
      if (elSelect.fs) elSelect.fs.close();
      elSelect.fs = newFileSet(elSelect.value);
      elSelect.selectedIndex = 0;
      nextSelection(elSelect, elViewer.phViewer);
    });

    elNextButton.addEventListener('click', (event) => {
      event.preventDefault();
      nextSelection(elSelect, elViewer.phViewer);
    });
  });
}
