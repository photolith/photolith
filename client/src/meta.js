// https://datatables.net/download/npm
import DataTable from 'datatables.net-bs5';

const { DateTime } = require('luxon');

const ISO_DT_REGEX = /^(\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d\.\d+([+-][0-2]\d:[0-5]\d|Z))|(\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d([+-][0-2]\d:[0-5]\d|Z))|(\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d([+-][0-2]\d:[0-5]\d|Z))$/;

// Cache renderers, changing locale requires a page reload
let renderNumber;

function htmlEscape (s) {
  return (new window.Option(s)).innerHTML;
}

// https://datatables.net/reference/option/columns.render#function
export function renderMetaCell (k, data, type, row, meta) {
  let out = data;

  if (typeof out === 'object' && out.id && out.en) {
    // Resolve language, stripping off any -GB
    out = out[document.documentElement.lang.replace(/\W.*/, '')] || out.en;
  }

  if (type && type !== 'display') {
    // DataTables.net requesting non-display format, stop here.
    return out;
  }

  if (typeof out === 'number' && k.endsWith('Year')) {
    // Pass years through verbatim, without thousand separators
  } else if (typeof out === 'number') {
    // https://datatables.net/manual/data/renderers#Number-helper
    renderNumber = renderNumber || DataTable.render.number(
      document.documentElement.getAttribute('data-thousand-separator') || ',',
      document.documentElement.getAttribute('data-decimal-separator') || '.'
    ).display;
    out = renderNumber(out);
  }

  if (ISO_DT_REGEX.test(out)) {
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

export function renderMetaLabel (metaLabel) {
  return htmlEscape(metaLabel);
}

export function populateIndividualData (indData, elTableBody) {
  const metaLabels = window.mApi.metaLabels();

  if (!elTableBody) elTableBody = window.document.querySelector('.individual-data tbody');

  // NB: Don't list values when undefined (i.e. in ingest when created_at is nonsensical)
  elTableBody.innerHTML = Object.keys(metaLabels).map((k) => indData[k] === undefined
    ? ''
    : `<tr>
    <td>${renderMetaLabel(metaLabels[k])}</td>
    <td>${renderMetaCell(k, indData[k], 'display', indData, undefined)}</td>
  </tr>`).join('\n');
}
