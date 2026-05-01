// https://datatables.net/download/npm
import DataTable from 'datatables.net-bs5';

import { changeEvent } from './events.js';

import { DateTime } from 'luxon';

const ISO_DT_REGEX = /^(\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d\.\d+([+-][0-2]\d:[0-5]\d|Z))|(\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d([+-][0-2]\d:[0-5]\d|Z))|(\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d([+-][0-2]\d:[0-5]\d|Z))$/;

// Cache renderers, changing locale requires a page reload
let renderNumber;

function htmlEscape (s) {
  return (new window.Option(s)).innerHTML;
}

function attribEscape (s) {
  return (new window.Option('', s)).outerHTML.match(/value="(.*?)"/)[1];
}

// https://datatables.net/reference/option/columns.render#function
export function renderMetaCell (k, data, type, row, meta) {
  // Resolve language, stripping off any -GB
  const lang = document.documentElement.lang.replace(/\W.*/, '');

  if (type === undefined) return data;

  if (type === 'form') {
    // NB: We use data-key so these values don't get submitted themselves, we sync JSON blob separately
    if (k.startsWith('nm_')) {
      return `<input type="number" class="form-control ph-meta" data-key="${k}" name="" value="${data === null ? '' : attribEscape(data)}" step="any">`;
    }
    if (k.startsWith('in_')) {
      return `<input type="number" class="form-control ph-meta" data-key="${k}" name="" value="${data === null ? '' : parseInt(data, 10)}" step="1">`;
    }
    if (k.startsWith('dt_')) {
      return `<input type="date" class="form-control ph-meta" data-key="${k}" name="" value="${data === null ? '' : attribEscape(data.replace(/T.*/, ''))}">`;
    }
    if (k.startsWith('tx_')) {
      return `<select class="form-select ph-meta" data-key="${k}" name=""><option value="" ${!data ? 'selected' : ''}>----</option>${Object.values(window.mApi.txFor(k.replace(/^tx_/, ''), data)).map((tx) => new window.Option(
        `${tx.id}: ${tx[lang] || tx.en}`,
        JSON.stringify(tx),
        data ? (tx.id === data.id) : false
      ).outerHTML).join('')}</select>`;
    }
    return `<input type="text" class="form-control ph-meta" data-key="${k}" name="" value="${data === null ? '' : attribEscape(data)}">`;
  }

  if (type === 'type' || type === 'sort') {
    if (typeof data === 'object' && data.id) {
      // Use taxonomy numeric ID for sorting
      return data.id;
    }
    return data;
  }

  if (type === 'filter') {
    if (typeof data === 'object' && data.id) {
      return data[lang] || data.en;
    }
    return data;
  }

  if (type === 'display') {
    let out = data;

    if (typeof out === 'object' && out.id && out.en) {
      out = out[lang] || out.en;
    } else if (typeof out === 'number' && Number.isInteger(out)) {
      // Pass years through verbatim, without thousand separators

    } else if (typeof out === 'number') {
      // https://datatables.net/manual/data/renderers#Number-helper
      // NB: Under nodeJS, DataTable is a function that needs to be fed a window
      //     See https://github.com/DataTables/Dist-DataTables-Bootstrap5/blob/7d09afc9038aaea5d8d045e18116d4d089203c9b/js/dataTables.bootstrap5.js#L21-L40
      renderNumber = renderNumber || (DataTable.render || DataTable(global.window).render).number(
        document.documentElement.getAttribute('data-thousand-separator') || ',',
        document.documentElement.getAttribute('data-decimal-separator') || '.',
        2
      ).display;
      out = renderNumber(out);
    } else if (ISO_DT_REGEX.test(out)) {
      // Convert ISO string to human-readable before continuing
      const dt = DateTime.fromISO(out);
      try {
        // Try first using the django locale
        // NB: Hafro browsers are set to en-US, even though they really want en-GB dates.
        //     Django only recognises en-gb, so this should do the "right" thing in this case.
        out = dt.setLocale(document.documentElement.lang).toLocaleString(DateTime.DATETIME_SHORT);
      } catch (e) {
        console.warn('Date formatting failed, trying without locale', e);
        out = dt.toLocaleString(DateTime.DATETIME_SHORT);
      }
    }
    return `<code>${htmlEscape(out)}</code>`;
  }

  throw new Error(`Unknown display type ${type}`);
}

export function renderMetaLabel (k, type) {
  const metaLabels = window.mApi.metaLabels();

  if (type === 'form') {
    return `<label class="col-form-label">${htmlEscape(metaLabels[k])}</label>`;
  }
  return htmlEscape(metaLabels[k]);
}

export function renderMetaRow (k, indData, tableMode) {
  // NB: Individual values missing means no row, but no data at all is allowed
  if (indData && indData[k] === undefined) return '';

  return `<tr>
    <td>${renderMetaLabel(k, tableMode)}</td>
    <td>${renderMetaCell(k, indData ? indData[k] : null, tableMode, indData || {}, undefined)}</td>
  </tr>`;
}

export function populateIndividualData (indData, elTableBody, tableMode = 'display') {
  const metaLabels = window.mApi.metaLabels('table_' + tableMode);
  const missingMeta = [null];

  if (!elTableBody) elTableBody = window.document.querySelector('.individual-data tbody');

  // NB: Don't list values when undefined (i.e. in ingest when created_at is nonsensical)
  elTableBody.innerHTML = Object.keys(metaLabels).map((k) => {
    const out = renderMetaRow(k, indData, tableMode);
    if (!out) missingMeta.push(k);
    return out;
  }).join('\n');

  // Populate add-new-metadata if present
  const elAddSelect = elTableBody.parentElement.querySelector(':scope>tfoot select.add-new-metadata');
  if (elAddSelect) {
    elAddSelect.innerHTML = missingMeta.map((k) => {
      // Fill in reserved spot for "Add..." prompt
      if (!k) return elAddSelect.options[0].outerHTML;
      // Ignore values without type prefix
      if (!k.match(/^(ch|nm|in|tx|dt)_/)) return '';
      return new window.Option(metaLabels[k], k).outerHTML;
    }).join('\n');

    // Wire up add select to append extra items
    if (!elAddSelect.classList.contains('meta-listening')) {
      elAddSelect.addEventListener('change', (event) => {
        const elContainer = document.createElement('TBODY');
        elContainer.innerHTML = renderMetaRow(event.target.value, undefined, 'form');

        // Append & Fire a change event for form control
        elTableBody.appendChild(elContainer.firstElementChild).querySelectorAll(':scope .ph-meta').forEach((el) => {
          el.dispatchEvent(changeEvent());
        });

        event.target.removeChild(event.target.options[event.target.selectedIndex]);
        event.target.selectedIndex = 0;
      });
      elAddSelect.classList.add('meta-listening');
    }
  }
}

/** For an input element generated by renderMetaCell, slot it's value back into a full data structure */
export function updateDataObject (data, elInput) {
  const key = elInput.getAttribute('data-key');
  const newValue = elInput.value;

  if (newValue === '') {
    // Delete empty values
    delete data[key];
  } else if (key.startsWith('nm_')) {
    data[key] = parseFloat(newValue);
  } else if (key.startsWith('in_')) {
    data[key] = parseInt(newValue, 10);
  } else if (key.startsWith('tx_')) {
    data[key] = JSON.parse(newValue);
    if (data[key].id === undefined) {
      // Empty value
      delete data[key];
    }
  } else {
    data[key] = newValue;
  }

  return data;
}

/** Render the search filter fields to sit in search page offscreen  */
export function renderSearchFilters (metaFields, searchParams) {
  const metaLabels = window.mApi.metaLabels('search_filter');

  // Append any search terms on querystring that aren't included in filter list
  for (const k of searchParams.keys()) {
    if (!metaLabels[k]) {
      metaLabels[k] = window.mApi.metaLabels()[k] || k;
    }
  }

  return ['project'].map((k) => {
    // If not set, don't pollute querystring with hidden field
    if (!searchParams.get(k)) return '';
    return `<input type="hidden" name="${k}" value="${searchParams.get(k)}">`;
  }).join('\n\n') + Object.keys(metaLabels).map((k) => {
    const controlId = 'filter-' + k + '-control';
    const mf = metaFields[k];
    let controlHtml;

    // If no metaFields, then we can't filter this
    if (!mf) return '';

    if (k.startsWith('ch')) {
      let vs = searchParams.getAll(k).filter((v) => !!v);
      if (vs.length === 0) vs = ['']; // Should be at least one box, so we have something to copy

      controlHtml = `<div class="input-group">
          ${vs.map((v) => `<input type="text" name="${k}" value="${v}" class="form-control">`).join('\n')}
          <button type="button" class="btn btn-outline-secondary" title="Add extra search" onclick="el = event.target.previousElementSibling; el.after(el.cloneNode()) ; return false">+</button>
      </div>`;
    } else if (k.startsWith('nm')) {
      controlHtml = `<div class="input-group">
          <input type="number" name="${k}" value="${searchParams.getAll(k)[0] || ''}" min="${mf.min}" max="${mf.max}" class="form-control range-start" id="${controlId}">
          <span class="input-group-text">..</span>
          <input type="number" name="${k}" value="${searchParams.getAll(k)[1] || ''}" min="${mf.min}" max="${mf.max}" class="form-control range-end" id="${controlId}-2">
        </div>`;
    } else if (k.startsWith('in')) {
      controlHtml = `<div class="input-group">
          <input type="number" name="${k}" value="${searchParams.getAll(k)[0] || ''}" min="${mf.min}" max="${mf.max}" class="form-control range-start" id="${controlId}" step="1">
          <span class="input-group-text">..</span>
          <input type="number" name="${k}" value="${searchParams.getAll(k)[1] || ''}" min="${mf.min}" max="${mf.max}" class="form-control range-end" id="${controlId}-2" step="1">
        </div>`;
    } else if (k.startsWith('tx')) {
      controlHtml = `<select multiple name="${k}" class="form-select" id="${controlId}">
          ${mf.choices.map((tx) => `<option value="${tx.id}" ${searchParams.getAll(k).indexOf(tx.id.toString()) > -1 ? 'selected' : ''}>${tx.id}: ${tx[document.documentElement.lang.replace(/\W.*/, '')]}</option>`)}
        </select>`;
    } else if (k.startsWith('dt')) {
      controlHtml = `<div class="input-group">
          <input type="date" name="${k}" value="${searchParams.getAll(k)[0] || ''}" class="form-control range-start" id="${controlId}">
          <span class="input-group-text">..</span>
          <input type="date" name="${k}" value="${searchParams.getAll(k)[1] || ''}" class="form-control range-end" id="${controlId}-2">
        </div>`;
    }

    return `<div class="mb-3">
        <label for="${controlId}" class="form-label">${metaLabels[k]}</label>
        ${controlHtml}
      </div>`;
  }).join('\n\n');
}
