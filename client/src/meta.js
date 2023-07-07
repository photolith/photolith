function htmlEscape (s) {
  return (new window.Option(s)).innerHTML;
}

function langSelect (obj) {
  // NB: If it doesn't have either 'is' or 'en' property, it's probably a string already
  if (!obj) return obj;
  return obj[document.documentElement.lang] || obj.en || obj;
}

// https://datatables.net/reference/option/columns.render#function
export function renderMetaCell (data, type, row, meta) {
  return `<code>${htmlEscape(langSelect(data))}</code>`;
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
