class NullFileSet {
  next () {
    return Promise.resolve({ f: null, remaining: 0 });
  }
}

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

function newFileSet (val) {
  val = val.split(':');

  if (val[0] === 'null') return new NullFileSet();
  if (val[0] === 'fileselect') return new LocalFileSet();
  throw new Error('Unknown select type ' + val.join(':'));
}

function nextSelection (elSelect, phViewer) {
  return elSelect.fs.next().then(({ f = null, remaining = 0 }) => {
    if (!elSelect.options[0].phOrigText) elSelect.options[0].phOrigText = elSelect.options[0].text;

    elSelect.selectedIndex = 0;
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
    const elViewer = window.document.querySelector(elIngestSelect.getAttribute('data-viewer'));
    const elNextButton = elIngestSelect.querySelector(':scope .ph-ingest-next');

    elSelect.fs = newFileSet('null');

    elSelect.addEventListener('change', (event) => {
      elSelect.fs = newFileSet(elSelect.value);
      nextSelection(elSelect, elViewer.phViewer);
    });

    elNextButton.addEventListener('click', (event) => {
      event.preventDefault();
      nextSelection(elSelect, elViewer.phViewer);
    });
  });
}
