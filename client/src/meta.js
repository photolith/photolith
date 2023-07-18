// https://datatables.net/download/npm
import DataTable from 'datatables.net-bs5';

// Cache renderers, changing locale requires a page reload
let renderNumber;

function htmlEscape (s) {
  return (new window.Option(s)).innerHTML;
}

// https://datatables.net/reference/option/columns.render#function
export function renderMetaCell (data, type, row, meta) {
  let out = data;

  if (typeof out === 'object' && out.id && out.en) {
    // Resolve language
    out = out[document.documentElement.lang] || out.en;
  }

  if (typeof out === 'number') {
    // https://datatables.net/manual/data/renderers#Number-helper
    renderNumber = renderNumber || DataTable.render.number(
      document.documentElement.getAttribute('data-thousand-separator') || ',',
      document.documentElement.getAttribute('data-decimal-separator') || '.'
    ).display;
    out = renderNumber(out);
  }

  return `<code>${htmlEscape(out)}</code>`;
}

export function renderMetaLabel (metaLabel) {
  return htmlEscape(metaLabel);
}

export function populateIndividualData (indData, elTableBody) {
  const metaLabels = window.mApi.metaLabels(document.documentElement.lang);

  if (!elTableBody) elTableBody = window.document.querySelector('.individual-data tbody');

  elTableBody.innerHTML = Object.keys(metaLabels).map((k) => `<tr>
    <td>${renderMetaLabel(metaLabels[k])}</td>
    <td>${renderMetaCell(indData[k], 'display', indData, undefined)}</td>
  </tr>`).join('\n');
}
