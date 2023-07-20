import { displayAlert } from './alert';
import { changeEvent } from './events';
import { jsonFetch } from './fetch';
import { populateIndividualData } from './meta';

function formRefresh (event) {
  const elForm = event.target.form;

  // Can progress iff all form elements are filled in
  elForm.save.disabled = !!Array.from(elForm.elements).find((el) => el.name !== 'selection' && el.name !== 'image_href' && !el.value);

  if (event.target.name === 'sample') {
    // Update rest of form to match new sample
    return (event.target.value ? window.mApi.sampleDetail(event.target.value) : Promise.resolve({ individuals: [] })).then((sd) => {
      elForm.querySelector(':scope .individuals').innerHTML = sd.individuals.map((ind, i) => {
        return `
          <input type="hidden" name="individuals[${i}][data]" value="">
          <input type="hidden" name="individuals[${i}][bounding_box]" value="">
        `;
      }).join('\n');
      sd.individuals.forEach((ind, i) => {
        elForm[`individuals[${i}][data]`].value = JSON.stringify(ind);
      });
      elForm.selection.value = '';
      elForm.dispatchEvent(new window.CustomEvent('load_individuals', { detail: sd.individuals }));
    }).catch((err) => {
      elForm.querySelector(':scope .individuals').innerHTML = '';
      elForm.selection.value = '';
      throw err;
    }).finally(() => {
      elForm.selection.dispatchEvent(changeEvent());
    });
  }

  if (event.target.name === 'image_file') {
    // Image file changed, so image_href is no longer valid
    elForm.image_href.value = '';
  }

  if (event.target.name === 'selection') {
    const ids = JSON.parse((elForm[event.target.value.replace(/\[bounding_box\]/, '[data]')] || {}).value || '{}');
    populateIndividualData(ids, elForm.querySelector(':scope .individual-data tbody'));
  }
}

function formSubmit (elForm) {
  return Promise.resolve().then(() => {
    if (elForm.image_href.value) return;
    if (!elForm.image_file.phBlob) throw new Error('Missing file, nothing to upload');

    // Image not already uploaded, so upload it
    return jsonFetch('/media/upload/', {
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
      elForm.image_href.value = data.href;
    });
  }).then(() => {
    elForm.classList.add('rendering');
    return jsonFetch('/ingest/upload/', {
      method: 'POST',
      body: new FormData(elForm)
    });
  }).then((createdInds) => {
    displayAlert('success', `Uploaded ${createdInds.created_individuals.length} individuals`);
    elForm.reset();
  }).finally(() => {
    elForm.classList.remove('rendering');
  });
}

export function init (parent) {
  parent.querySelectorAll('form.ingest-form').forEach((elForm) => {
    elForm.addEventListener('change', formRefresh);
    elForm.addEventListener('reset', (event) => {
      // Give the form a chance to reset, then refresh the sample field (triggering everything else to refresh)
      window.setTimeout(() => formRefresh({ target: elForm.sample }), 10);
    });
    elForm.addEventListener('submit', (event) => {
      event.preventDefault();
      formSubmit(elForm);
    });
  });
}
