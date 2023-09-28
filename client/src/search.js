// https://datatables.net/download/npm
import DataTable from 'datatables.net-bs5';
import TomSelect from 'tom-select';

import { init as initCroppedViewer } from './cropped_viewer';
import { htmlFetch, jsonFetchCached } from './fetch';
import { renderMetaLabel, renderMetaCell } from './meta';

function populateFilter (elForm) {
  const metaLabels = window.mApi.metaLabels();
  const elBody = elForm.querySelector('.offcanvas-body');
  const metaFields = JSON.parse(document.getElementById('meta_fields').textContent);
  const searchParams = new URLSearchParams(window.location.search);

  elBody.innerHTML = ['project'].map((k) => {
    // If not set, don't pollute querystring with hidden field
    if (!searchParams.get(k)) return '';
    return `<input type="hidden" name="${k}" value="${searchParams.get(k)}">`;
  }).join('\n\n') + Object.keys(metaLabels).map((k) => {
    const controlId = 'filter-' + k + '-control';
    const mf = metaFields[k];
    let controlHtml;

    // If no metaFields, then we can't filter this
    if (!mf) return '';

    if (mf.filter_name.startsWith('ch')) {
      controlHtml = `<input type="text" name="${mf.filter_name}" value="${searchParams.get(mf.filter_name) || ''}" class="form-control" id="${controlId}">`;
    } else if (mf.filter_name.startsWith('nm')) {
      controlHtml = `<div class="input-group">
          <input type="text" name="${mf.filter_name}" value="${searchParams.getAll(mf.filter_name)[0] || ''}" min="${mf.min}" max="${mf.max}" class="form-control range-start" id="${controlId}">
          <span class="input-group-text">..</span>
          <input type="text" name="${mf.filter_name}" value="${searchParams.getAll(mf.filter_name)[1] || ''}" min="${mf.min}" max="${mf.max}" class="form-control range-end" id="${controlId}-2">
        </div>`;
    } else if (mf.filter_name.startsWith('tx')) {
      controlHtml = `<select multiple name="${mf.filter_name}" class="form-select" id="${controlId}">
          ${mf.choices.map((tx) => `<option value="${tx.id}" ${searchParams.getAll(mf.filter_name).indexOf(tx.id.toString()) > -1 ? 'selected' : ''}>${tx.id}: ${tx['str_' + document.documentElement.lang]}</option>`)}
        </select>`;
    } else if (mf.filter_name.startsWith('dt')) {
      controlHtml = `<div class="input-group">
          <input type="date" name="${mf.filter_name}" value="${searchParams.getAll(mf.filter_name)[0] || ''}" class="form-control range-start" id="${controlId}">
          <span class="input-group-text">..</span>
          <input type="date" name="${mf.filter_name}" value="${searchParams.getAll(mf.filter_name)[1] || ''}" class="form-control range-end" id="${controlId}-2">
        </div>`;
    }

    return `<div class="mb-3">
        <label for="${controlId}" class="form-label">${metaLabels[k]}</label>
        ${controlHtml}
      </div>`;
  }).join('\n\n');

  elBody.querySelectorAll(':scope select').forEach((el) => new TomSelect(el, {
  }));
}

function filterChange (elForm, elTarget) {
  if (!elTarget.name) {
    // Do nothing for unnamed elements
  } else if (elTarget.classList.contains('range-start')) {
    const elRangeEnd = elTarget.nextElementSibling.nextElementSibling;
    if (!elRangeEnd.value) elRangeEnd.value = elTarget.value;
  }
}

export function init (parent) {
  parent.querySelectorAll('form.filter-form').forEach((elForm) => {
    populateFilter(elForm);
    elForm.addEventListener('change', (event) => {
      filterChange(elForm, event.target);
    });
  });
  parent.querySelectorAll('.ph-search-table').forEach((elSearchTable) => {
    const lang = document.documentElement.lang || 'en';
    const metaLabels = window.mApi.metaLabels();

    // https://datatables.net/reference/option/%24.fn.dataTable.ext.errMode
    DataTable.ext.errMode = 'throw';
    const table = new DataTable(elSearchTable, {
      // Load language from plugin: https://datatables.net/plug-ins/i18n/
      language: { url: lang !== 'en' ? `/static/datatables.net-plugins/i18n/${lang}.json` : undefined },
      ajax: function (data, callback) {
        // https://datatables.net/reference/option/ajax#Types
        return jsonFetchCached('/search/data/', window.document.location.search, {}).then(callback);
      },
      columns: Object.keys(metaLabels).map((k) => {
        // https://datatables.net/reference/option/columns
        return {
          data: k,
          defaultContent: '',
          title: renderMetaLabel(metaLabels[k]),
          // https://datatables.net/reference/option/columns.createdCell
          createdCell: function (td, cellData) {
            if (typeof cellData === 'number') td.classList.add('text-end');
            td.classList.add('text-nowrap');
          },
          render: renderMetaCell
        };
      }),
      createdRow: function (row, data, dataIndex) {
        // Get bootstrap to add a hand cursor
        row.setAttribute('role', 'button');
      },
      searching: false
    });

    table.on('click', 'td', function (e) {
      // https://datatables.net/reference/api/row().child
      const row = table.row(e.target.closest('tr'));

      // No row node found, was a click on a child row
      if (!row.node()) return;

      // Create child row if not already present
      if (!row.child() || row.child().length === 0) {
        row.child('<div><div class="rendering" style="width: 10rem; height: 10rem; margin: auto;"></div></div>');
        htmlFetch('/annotate/' + row.data().id + '/snippet/').then((html) => {
          row.child(html);
          row.child()[0].querySelectorAll('a[href^="/annotate/"]').forEach((el) => {
            // Add current search querystring to any annotate links
            // NB: Django doesn't have this when generating the snippet
            el.href += document.location.search;
          });
          initCroppedViewer(row.child()[0]);
        });
      }

      // Open/close row
      if (row.child.isShown()) {
        row.child.hide();
      } else {
        row.child.show();
      }
    });
  });
}
