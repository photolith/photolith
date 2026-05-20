import { displayAlert } from './alert';
import { changeEvent } from './events';
import { jsonFetch } from './fetch';
import { populateIndividualData, updateDataObject } from './meta';

function checkExisting (labels, warnMsg) {
  const sp = new URLSearchParams();
  // Filter by any of the labels we provided
  labels.forEach((l) => sp.append('ch_slideLabel', l));

  // Nothing to search for, don't bother.
  if (sp.toString() === '') return;

  jsonFetch('/search/data/?' + sp).then((data) => {
    if (!data.data.length) return;
    displayAlert('warning',
      warnMsg.replace('%d', `<b><a href="/search/?${sp}" target="_blank">${data.data.length}</a></b>`) +
      `:<ul>${data.data.map((i) => `<li>${i.__str__}</li>`).join('\n')}</ul>`,
      0); // No timeout for the alert, you have to dismiss it
  });
}

/** Return data element for currently selected individual */
function getSelectedIndividualData (elForm) {
  if (elForm.individual.selectedIndex > 0) {
    // Single individual mode, ensure it's always selected
    return elForm['data:' + elForm.individual.options[elForm.individual.selectedIndex].value];
  }
  if (elForm.elements.selection.value.startsWith('bounding_box:')) {
    // Bounding box is selected, select corresponding individual
    return elForm['data:' + elForm.elements.selection.value.replace(/^bounding_box:/, '')];
  }
  return null;
}

function formRefresh (event) {
  const elForm = event.target.form;

  // Can progress iff there's at least one individual bounding_box to upload
  elForm.clear_all.disabled = elForm.save.disabled = !Array.from(elForm.elements).find((el) => {
    return el.name.startsWith('bounding_box:') && el.value;
  });

  if (event.target.name === 'slide-label') {
    // Display help if no value, or table
    elForm.querySelector(':scope .label_help').classList.toggle('d-none', event.target.value);
    elForm.querySelector(':scope .individual-data').classList.toggle('d-none', !event.target.value);

    // Clear out old individuals first
    elForm.querySelector(':scope .individuals').innerHTML = '';
    elForm.elements.individual.innerHTML = '<option selected="selected" value="">*</option>';
    elForm.dispatchEvent(new window.CustomEvent('element_addremove'));
    elForm.classList.add('rendering');
    // Update rest of form to match new sample, getting data from fileset or mApi if none provided
    return Promise.resolve().then(() => {
      if (elForm.image_file.phIndividuals) {
        const individuals = elForm.image_file.phIndividuals;
        elForm.image_file.phIndividuals = undefined; // Only use it once, subsequent changes behave like new images
        return individuals;
      }
      if (event.target.value) return window.mApi.sampleDetail(event.target.value);
      return [];
    }).then((individuals) => {
      if (!individuals) individuals = []; // Do nothing if no individuals returned

      // If no DB id set, check for existing individuals. Don't bother checking the response, let it display it's own messages
      if (Object.values(individuals).find((i) => i.id) === undefined) {
        checkExisting(new Set(individuals.map((x) => x.ch_slideLabel)), elForm.getAttribute('data-locale-warnexisting'));
      }

      elForm.querySelector(':scope .individuals').innerHTML = individuals.map((ind, indIdx) => {
        return `
          <input type="hidden" name="data:${indIdx}" value="">
          <input type="hidden" name="bounding_box:${indIdx}" value="">
        `;
      }).join('\n');
      individuals.forEach((ind, indIdx) => {
        elForm.elements.individual.append(new window.Option(window.mApi.individualLabel(ind), indIdx));
        elForm[`data:${indIdx}`].value = JSON.stringify(ind);
        elForm[`bounding_box:${indIdx}`].value = ind.bounding_box ? JSON.stringify(ind.bounding_box) : '';
        elForm[`bounding_box:${indIdx}`].setAttribute('data-label', window.mApi.individualLabel(ind));
      });
      elForm.selection.value = '';
      // Lots of individuals, select the first rather than trying to display them all on-screen
      // Single individual, select it rather than '*', so we always show it's metadata.
      elForm.elements.individual.selectedIndex = individuals.length > 50 || individuals.length === 1 ? 1 : 0;
      elForm.elements.individual.dispatchEvent(changeEvent());
    }).catch((err) => {
      elForm.querySelector(':scope .individuals').innerHTML = '';
      elForm.selection.value = '';
      throw err;
    }).finally(() => {
      elForm.classList.remove('rendering');
      elForm.selection.dispatchEvent(changeEvent());
    });
  }
  if (event.target.name === 'individual') {
    const selIndividual = event.target.options[event.target.selectedIndex].value;

    // Twiddle disabled on all inputs to match individual dropdown
    elForm.querySelectorAll(':scope .individuals input').forEach((el) => {
      if (selIndividual) {
        el.disabled = !el.name.endsWith(':' + selIndividual);
      } else {
        el.disabled = false;
      }
    });
    elForm.dispatchEvent(new window.CustomEvent('element_addremove'));
    elForm.selection.dispatchEvent(changeEvent());
  }

  if (event.target.name === 'image_file') {
    // If there's an image, we'll be able to fill in form
    elForm.querySelector('fieldset').disabled = !event.target.value;
  }

  if (event.target.name === 'selection') {
    const elData = getSelectedIndividualData(elForm);

    // Hide form if nothing selected
    elForm.querySelector(':scope .label_help').classList.toggle('d-none', elData !== null);
    elForm.querySelector(':scope .individual-data').classList.toggle('d-none', elData === null);

    if (elData !== null) {
      const elTBody = elForm.querySelector(':scope .individual-data tbody');
      elTBody.innerHTML = ''; // Remove any previous selections
      populateIndividualData(JSON.parse(elData.value || '{}'), elTBody, 'form');
    }
  }

  if (event.target.classList.contains('ph-meta')) {
    // Sync ph-meta elements up with JSON, which gets submitted server-side
    // NB: Sending ph-meta elements directly server-side may be more sensible long-term
    const elData = getSelectedIndividualData(elForm);
    if (!elData) return;

    const newData = updateDataObject(JSON.parse(elData.value || '{}'), event.target);
    elData.value = JSON.stringify(newData);

    if (Object.hasOwn(newData, 'ch_individualLabel')) {
      // If label changed, copy value to bounding_box & trigger form (thus updating fabricjs)
      const indIdx = elData.name.replace(/^data:/, ''); // NB: will still be string, but don't care
      const elBB = elForm['bounding_box:' + indIdx];
      if (newData.ch_individualLabel !== elBB.getAttribute('data-label')) {
        elBB.setAttribute('data-label', newData.ch_individualLabel);
        elBB.dispatchEvent(changeEvent());

        // Copy to individual select box too
        Array.from(elForm.elements.individual.options).forEach((o) => {
          if (o.value === indIdx) o.text = newData.ch_individualLabel;
        });
      }
    }
  }

  if (event.target.classList.contains('ph-meta-copy')) {
    // Sync current data up with any other
    const sourceDataEl = getSelectedIndividualData(elForm);
    if (!sourceDataEl) return;
    const sourceData = JSON.parse(sourceDataEl.value || '{}');

    elForm.querySelectorAll(':scope input[name^="data:"]').forEach((dataEl) => {
      if (dataEl === sourceDataEl) return;
      const data = JSON.parse(dataEl.value || '{}');

      let modified = false;
      for (const [k, v] of Object.entries(sourceData)) {
        if (!(k in data)) {
          data[k] = v;
          modified = true;
        }
      }
      if (modified) dataEl.value = JSON.stringify(data);
    });

    displayAlert('success', event.target.getAttribute('data-locale-success'), 0);
  }
}

function formSubmit (event) {
  const elForm = event.submitter.form;

  if (event.submitter.name === 'clear_all' && !window.confirm(elForm.getAttribute('data-locale-warnclear'))) {
    return false;
  }

  return Promise.resolve().then(() => {
    elForm.classList.add('rendering');

    // Clear all bounding boxes first, triggering mass deletion
    if (event.submitter.name === 'clear_all') {
      Array.from(elForm.elements).forEach((el) => {
        if (el.name.startsWith('bounding_box:')) {
          el.value = '';
        }
      });
    }

    // If we already have an image_id, skip upload-image step
    if (elForm.image_id.value) return;
    if (!elForm.image_file.phBlob) throw new Error('Missing file, nothing to upload');

    // Image not already uploaded, so upload it
    return jsonFetch('/ingest/upload-image/', {
      method: 'POST',
      body: elForm.image_file.phBlob,
      headers: {
        'X-CSRFToken': elForm.csrfmiddlewaretoken.value,
        'X-Photolith-fileset': elForm.image_file.value,
        'X-Photolith-filename': elForm.image_file.phBlob.name
      }
    }).then((data) => {
      elForm.image_id.value = data.id;
    });
  }).then(() => {
    return jsonFetch('/ingest/upload/', {
      method: 'POST',
      body: new FormData(elForm)
    });
  }).then((data) => {
    if (event.submitter.name === 'clear_all') {
      // Clear out evidence of previous individuals
      elForm.elements['slide-label'].value = '';
      elForm.elements.individual.selectedIndex = 0;
      elForm.elements.selection.value = '';
      elForm.querySelector(':scope .individuals').innerHTML = '';
      elForm.image_file.phIndividuals = undefined;
      elForm.dispatchEvent(new window.CustomEvent('element_addremove'));
    } else {
      Object.keys(data).forEach((k) => {
        if (elForm[k]) {
          elForm[k].value = JSON.stringify(data[k]);
        }
      });
    }
  }).finally(() => {
    elForm.classList.remove('rendering');
    elForm.selection.dispatchEvent(changeEvent()); // To update data view
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
      formSubmit(event);
    });
    elForm.querySelector(':scope .label_help>ul').innerHTML = window.mApi.labelHelp().map((x) => '<li>' + x + '</li>').join('\n');
  });
}
