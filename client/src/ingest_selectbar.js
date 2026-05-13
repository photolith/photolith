import { changeEvent, toggleUnloadWarning } from './events';
import { Cancelled } from './errors';
import { LocalFileSet } from './fileset/local';
import { LocalDirectoryFileSet } from './fileset/local_directory';
import { NullFileSet } from './fileset/null';
import { ServerFileSet } from './fileset/server';
import { WebcamFileSet } from './fileset/webcam';
import { PhotolithFileSet } from './fileset/photolith';

function newFileSet (val) {
  val = val.split(':');

  if (val[0] === 'null') return new NullFileSet();
  if (val[0] === 'fileselect') return new LocalFileSet();
  if (val[0] === 'localdirselect') return new LocalDirectoryFileSet();
  if (val[0] === 'server') return new ServerFileSet(val[1]);
  if (val[0] === 'webcam') return new WebcamFileSet(val[1]);
  if (val[0] === 'photolith') return new PhotolithFileSet(val[1]);
  throw new Error('Unknown fileset type ' + val.join(':'));
}

function nextSelection (elSelect, elSyncForm) {
  elSyncForm.image_file.value = '';
  elSyncForm.image_file.phBlob = 'start_load';
  elSyncForm.image_file.dispatchEvent(changeEvent());

  // Should return either a blob, or { image_id, blob, individuals, name (to populate in selectBar), slide-label, scale_mm, scale_line }
  return elSelect.fs.next().then((f) => {
    const remaining = elSelect.fs.remaining();

    // Convert bare blobs to objects
    if (f === null) {
      f = { blob: null };
    } else if (f instanceof Blob) {
      f = { blob: f, name: f.name };
    }

    if (!elSelect.options[0].phOrigText) elSelect.options[0].phOrigText = elSelect.options[0].text;

    if (f.blob) {
      elSelect.options[0].text = `[ ${f.name}${remaining > 0 ? `, +${remaining}...` : ''} ]`;
    } else {
      elSelect.options[0].text = elSelect.options[0].phOrigText;
    }

    elSyncForm.image_file.value = elSelect.fs.name;
    elSyncForm.image_file.phBlob = f.blob;
    elSyncForm.image_id.value = f.image_id || '';
    if (f.individuals && f.individuals.length > 0) {
      // Stuff the individuals here, so ingest_form:formRefresh() can find them
      elSyncForm.image_file.phIndividuals = f.individuals;
    }
    elSyncForm.image_file.dispatchEvent(changeEvent());

    // Update slidelabel and trigger rest of page to populate itself
    if (f['slide-label']) {
      elSyncForm['slide-label'].value = f['slide-label'];
      elSyncForm['slide-label'].dispatchEvent(changeEvent());
    }

    if (f.scale_mm) {
      elSyncForm.scale_mm.value = f.scale_mm;
      elSyncForm.scale_mm.dispatchEvent(changeEvent());
    }

    if (f.scale_line) {
      elSyncForm.scale_line.value = JSON.stringify(f.scale_line);
      elSyncForm.scale_line.dispatchEvent(changeEvent());
    }

    toggleUnloadWarning(true);
  }).catch((err) => {
    // Clear the loading spinner, if still going
    elSyncForm.image_file.value = '';
    elSyncForm.image_file.phBlob = null;
    elSyncForm.image_id.value = '';
    elSyncForm.image_file.phIndividuals = undefined;
    elSyncForm.image_file.dispatchEvent(changeEvent());

    if (err instanceof Cancelled || (err instanceof DOMException && err.code === err.ABORT_ERR)) {
      // File select cancelled, don't change anything.
      return;
    }
    throw err;
  });
}

export function init (parent) {
  parent.querySelectorAll('.ph-ingest-select-bar').forEach((elSelectBar) => {
    const elSelect = elSelectBar.querySelector(':scope select');
    const elSyncForm = window.document.querySelector(elSelect.getAttribute('data-sync-form'));

    elSelect.fs = newFileSet('null');

    elSelect.addEventListener('change', (event) => {
      if (elSelect.fs) elSelect.fs.close();
      elSelect.fs = newFileSet(elSelect.value);
      elSelect.selectedIndex = 0;
      toggleUnloadWarning(false);
      nextSelection(elSelect, elSyncForm);
    });
    // If there's an initial item selected, trigger select now
    if (elSelect.selectedIndex > 0) {
      elSelect.dispatchEvent(changeEvent());
    }

    elSelectBar.querySelector(':scope *[data-action=next]').addEventListener('click', (event) => {
      event.preventDefault();
      nextSelection(elSelect, elSyncForm);
    });

    elSyncForm.addEventListener('submit', (event) => {
      toggleUnloadWarning(elSelect.fs.remaining() > 0);
    });
  });
}
