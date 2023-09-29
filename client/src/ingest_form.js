import { displayAlert } from './alert';
import { changeEvent } from './events';
import { jsonFetch, clearFetchCache } from './fetch';
import { populateIndividualData } from './meta';

function formRefresh (event) {
  const elForm = event.target.form;

  // Can progress iff there's at least one individual bounding_box to upload
  elForm.save.disabled = !Array.from(elForm.elements).find((el) => {
    return el.name.startsWith('bounding_box:') && el.value;
  });

  if (event.target.name === 'slide-label') {
    // Clear out old individuals first
    elForm.querySelector(':scope .individuals').innerHTML = '';
    elForm.dispatchEvent(new window.CustomEvent('load_individuals'));
    elForm.classList.add('rendering');
    // Update rest of form to match new sample
    return (event.target.value ? window.mApi.sampleDetail(event.target.value) : Promise.resolve({ individuals: [] })).then((sd) => {
      elForm.querySelector(':scope .individuals').innerHTML = sd.individuals.map((ind, indIdx) => {
        return `
          <input type="hidden" name="data:${indIdx}" value="">
          <input type="hidden" name="bounding_box:${indIdx}" value="">
        `;
      }).join('\n');
      sd.individuals.forEach((ind, indIdx) => {
        elForm[`data:${indIdx}`].value = JSON.stringify(ind);
        elForm[`bounding_box:${indIdx}`].setAttribute('data-label', window.mApi.individualLabel(ind));
      });
      elForm.selection.value = '';
      elForm.dispatchEvent(new window.CustomEvent('load_individuals'));
    }).catch((err) => {
      elForm.querySelector(':scope .individuals').innerHTML = '';
      elForm.selection.value = '';
      throw err;
    }).finally(() => {
      elForm.classList.remove('rendering');
      elForm.selection.dispatchEvent(changeEvent());
    });
  }

  if (event.target.name === 'image_file') {
    // Image file changed, so image_content is no longer valid
    elForm.image_content.value = '';

    // If there's an image, we'll be able to fill in form
    elForm.querySelector('fieldset').disabled = !event.target.value;
  }

  if (event.target.name === 'selection') {
    const ids = JSON.parse((elForm[event.target.value.replace(/^bounding_box:/, 'data:')] || {}).value || '{}');
    populateIndividualData(ids, elForm.querySelector(':scope .individual-data tbody'));
  }
}

function formSubmit (elForm) {
  return Promise.resolve().then(() => {
    if (elForm.image_content.value) return;
    if (!elForm.image_file.phBlob) throw new Error('Missing file, nothing to upload');

    // Image not already uploaded, so upload it
    return jsonFetch('/ingest/upload-image/', {
      method: 'POST',
      body: elForm.image_file.phBlob,
      headers: {
        'X-CSRFToken': elForm.csrfmiddlewaretoken.value,
        'X-Photolith-fileset': elForm.image_file.value,
        'X-Photolith-filename': elForm.image_file.phBlob.name,
        'X-Photolith-scale-line': elForm.scale_line.value,
        'X-Photolith-scale-mm': elForm.scale.value
      }
    }).then((data) => {
      elForm.image_content.value = data.content;
    });
  }).then(() => {
    elForm.classList.add('rendering');
    return jsonFetch('/ingest/upload/', {
      method: 'POST',
      body: new FormData(elForm)
    });
  }).then((createdInds) => {
    displayAlert('success', `Uploaded ${createdInds.created_individuals.length} individuals`);
    clearFetchCache(); // Remove cached search results, so new ingests show up.
    elForm.reset();
  }).finally(() => {
    elForm.classList.remove('rendering');
  });
}

export function init (parent) {
  parent.querySelectorAll('form.ingest-form').forEach((elForm) => {
    elForm.addEventListener('change', formRefresh);
    elForm.addEventListener('reset', (event) => {
      // Give the form a chance to reset, then refresh the slide-label field (triggering everything else to refresh)
      window.setTimeout(() => formRefresh({ target: elForm['slide-label'] }), 10);
    });
    elForm.addEventListener('submit', (event) => {
      event.preventDefault();
      formSubmit(elForm);
    });
  });
}
