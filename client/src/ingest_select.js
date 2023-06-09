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
      this.files = files;
      return { f: files.shift(), remaining: files.length };
    });
  }
}

function newSelection (elSelect, val) {
  if (val[0] === 'fileselect') {
    elSelect.fs = new LocalFileSet();
  } else {
    throw new Error('Unknown select type ' + val.join(':'));
  }

  return elSelect.fs;
}

function nextSelection (elSelect, phViewer) {
  return elSelect.fs.next().then(({ f = null, remaining = 0 }) => {
    if (!elSelect.options[0].phOrigText) elSelect.options[0].phOrigText = elSelect.options[0].text;

    if (f) {
      elSelect.options[0].text = `[ ${f.name}${remaining > 0 ? `, +${remaining}...` : ''} ]`;
      phViewer.load(f);
    } else {
      elSelect.options[0].text = elSelect.options[0].phOrigText;
    }
  });
}

export function init (window) {
  window.document.querySelectorAll('.ph-ingest-select').forEach((elIngestSelect) => {
    const elSelect = elIngestSelect.querySelector(':scope select');

    elSelect.addEventListener('change', (event) => {
      const elViewer = window.document.querySelector(elIngestSelect.getAttribute('data-viewer'));

      newSelection(elSelect, elSelect.value.split(':'));
      if (elSelect.fs) nextSelection(elSelect, elViewer.phViewer);
      elSelect.selectedIndex = 0;
    });
    elIngestSelect.querySelector(':scope .ph-ingest-next').addEventListener('click', (event) => {
      const elViewer = window.document.querySelector(elIngestSelect.getAttribute('data-viewer'));

      event.preventDefault();
      if (elSelect.fs) nextSelection(elSelect, elViewer.phViewer);
    });
  });
}
