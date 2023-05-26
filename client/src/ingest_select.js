class LocalFileSet {
  next () {
    // https://stackoverflow.com/a/62818263
    function promptFile (contentType, multiple) {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = multiple;
      input.accept = contentType;
      return new Promise(function (resolve) {
        document.activeElement.onfocus = function () {
          document.activeElement.onfocus = null;
          setTimeout(resolve.bind(this, []), 500);
        };
        input.onchange = function () {
          const files = Array.from(input.files);
          if (multiple) { return resolve(files); }
          resolve(files[0]);
        };
        input.click();
      });
    }

    return Promise.resolve().then(() => {
      if (this.files) return this.files;
      return promptFile(undefined, true);
    }).then((files) => {
      const f = files.shift();
      return f;
    });
  }
}

function newSelection (elIngestSelect, phViewer, val) {
  let fs;

  if (val[0] === 'fileselect') {
    fs = new LocalFileSet();
  } else {
    throw new Error('Unknown select type ' + val.join(':'));
  }

  return fs.next().then((f) => {
    phViewer.load(f);
  });
}

export function init (window) {
  window.document.querySelectorAll('.ph-ingest-select').forEach((elIngestSelect) => {
    const elSelect = elIngestSelect.querySelector(':scope select');

    elSelect.addEventListener('change', (event) => {
      const elViewer = window.document.querySelector(elIngestSelect.getAttribute('data-viewer'));

      newSelection(elIngestSelect, elViewer.phViewer, elSelect.value.split(':'));
      elSelect.selectedIndex = 0;
    });
  });
}
