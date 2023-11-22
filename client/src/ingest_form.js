import { displayAlert } from './alert';
import { changeEvent } from './events';
import { jsonFetch, clearFetchCache } from './fetch';
import { populateIndividualData } from './meta';

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
      `:<ul>${data.data.map((i) => `<li>${i.__str__}</li>`).join('\n')}</ul>`);
  });
}

function formRefresh (event) {
  const elForm = event.target.form;

  // Can progress iff there's at least one individual bounding_box to upload
  elForm.save.disabled = !Array.from(elForm.elements).find((el) => {
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
    // Update rest of form to match new sample
    return (event.target.value ? window.mApi.sampleDetail(event.target.value) : Promise.resolve([])).then((individuals) => {
      // Trigger a check for existing individuals. Don't bother checking the response, let it display it's own messages
      checkExisting(new Set(individuals.map((x) => x.slideLabel)), elForm.getAttribute('data-locale-warnexisting'));

      elForm.querySelector(':scope .individuals').innerHTML = individuals.map((ind, indIdx) => {
        return `
          <input type="hidden" name="data:${indIdx}" value="">
          <input type="hidden" name="bounding_box:${indIdx}" value="">
        `;
      }).join('\n');
      individuals.forEach((ind, indIdx) => {
        elForm.elements.individual.append(new window.Option(window.mApi.individualLabel(ind), indIdx));
        elForm[`data:${indIdx}`].value = JSON.stringify(ind);
        elForm[`bounding_box:${indIdx}`].setAttribute('data-label', window.mApi.individualLabel(ind));
      });
      elForm.selection.value = '';
      // Lots of individuals, select the first rather than trying to display them all on-screen
      elForm.elements.individual.selectedIndex = individuals.length > 50 ? 1 : 0;
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
  }

  if (event.target.name === 'image_file') {
    // Image file changed, so image_content is no longer valid
    elForm.image_content.value = '';

    // If there's an image, we'll be able to fill in form
    elForm.querySelector('fieldset').disabled = !event.target.value;
  }

  if (event.target.name === 'selection') {
    const ids = JSON.parse((elForm[event.target.value.replace(/^bounding_box:/, 'data:')] || {}).value || '{}');
    populateIndividualData(ids, elForm.querySelector(':scope .individual-data tbody'), 'form');
  }

  if (event.target.classList.contains('ph-meta')) {
    // Sync ph-meta elements up with JSON, which gets submitted server-side
    // NB: Sending ph-meta elements directly server-side may be more sensible long-term
    const dataEl = elForm[elForm.elements.selection.value.replace(/^bounding_box:/, 'data:')];
    if (!dataEl) return;
    const data = JSON.parse(dataEl.value || '{}');
    const key = event.target.getAttribute('data-key');
    const newValue = event.target.value;

    if (newValue === '') {
      // Delete empty values
      delete data[key];
    } else if (key.startsWith('nm_')) {
      data[key] = parseFloat(newValue);
    } else if (key.startsWith('tx_')) {
      data[key] = JSON.parse(newValue);
      if (data[key].id === undefined) {
        // Empty value
        delete data[key];
      }
    } else {
      data[key] = newValue;
    }

    // Put data back again
    dataEl.value = JSON.stringify(data);
  }
}

function formSubmit (elForm) {
  return Promise.resolve().then(() => {
    if (elForm.image_content.value) return;
    if (!elForm.image_file.phBlob) throw new Error('Missing file, nothing to upload');
    elForm.classList.add('rendering');

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
      elForm.image_content.value = data.content;
    });
  }).then(() => {
    return jsonFetch('/ingest/upload/', {
      method: 'POST',
      body: new FormData(elForm)
    });
  }).then((data) => {
    displayAlert(data.alert_status, data.alert);
    elForm.querySelector(':scope .individuals').innerHTML += Object.keys(data.created_individuals).map((k) => {
      return `<input type="hidden" name="individual_id:${k}" value="${data.created_individuals[k]}">`;
    }).join('\n') + Object.keys(data.updated_individuals).map((k) => {
      return `<input type="hidden" name="individual_id:${k}" value="${data.updated_individuals[k]}">`;
    }).join('\n');
    clearFetchCache(); // Remove cached search results, so new ingests show up.
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
    elForm.querySelector(':scope .label_help>ul').innerHTML = window.mApi.labelHelp().map((x) => '<li>' + x + '</li>').join('\n');
  });
}
