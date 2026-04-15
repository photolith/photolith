// https://datatables.net/download/npm
import DataTable from 'datatables.net-bs5';
import TomSelect from 'tom-select';

import { displayAlert } from './alert';
import { init as initCroppedViewer } from './cropped_viewer';
import { htmlFetch, jsonFetch } from './fetch';
import { renderMetaLabel, renderMetaCell } from './meta';
import { getDTState, setDTState, removeDTState } from './datatables_state';

function populateFilter (elForm) {
  const metaLabels = window.mApi.metaLabels('search_filter');
  const elBody = elForm.querySelector('.offcanvas-body');
  const metaFields = JSON.parse(document.getElementById('meta_fields').textContent);
  const searchParams = new URLSearchParams(window.location.search);

  // Append any search terms on querystring that aren't included in filter list
  for (const k of searchParams.keys()) {
    if (!metaLabels[k]) {
      metaLabels[k] = window.mApi.metaLabels()[k] || k;
    }
  }

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
    const metaLabels = window.mApi.metaLabels('search_columns');
    const defaultState = {
      order: [[0, 'asc'], [1, 'asc']]
    };

    // https://datatables.net/reference/option/%24.fn.dataTable.ext.errMode
    DataTable.ext.errMode = 'throw';
    const table = new DataTable(elSearchTable, {
      // Load language from plugin: https://datatables.net/plug-ins/i18n/
      language: { url: lang === 'en-us' ? undefined : `/static/datatables.net-plugins/i18n/${lang.replace(/-\w*/, (x) => x.toUpperCase())}.json` },
      // Allow table to resize with browser
      autoWidth: false,
      ajax: function (data, callback) {
        // https://datatables.net/reference/option/ajax#Types
        return jsonFetch('/search/data/' + removeDTState(window.document.location.search), {}).then((data) => {
          if (data.data[data.data.length - 1].truncated) {
            const truncRow = data.data.pop();
            displayAlert('warning', truncRow.truncated, 0);
          }
          return data;
        }).then(callback);
      },
      columns: Object.keys(metaLabels).map((k) => {
        // https://datatables.net/reference/option/columns
        return {
          data: k,
          defaultContent: '',
          title: renderMetaLabel(k),
          // https://datatables.net/reference/option/columns.createdCell
          createdCell: function (td, cellData) {
            if (typeof cellData === 'number') td.classList.add('text-end');
            td.classList.add('text-nowrap');
          },
          render: renderMetaCell.bind(null, k)
        };
      }),
      createdRow: function (row, data, dataIndex) {
        // Get bootstrap to add a hand cursor
        row.setAttribute('role', 'button');
      },
      order: getDTState(window.location.search, defaultState).order,
      stateSave: true,
      stateSaveCallback: function (settings, data) {
        setDTState(window.location.search, data);
      },
      stateLoadCallback: function (settings, callback) {
        callback(getDTState(window.location.search, defaultState));
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
        htmlFetch('/annotate/' + row.data().id + '/snippet/' + window.document.location.search).then((html) => {
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
        row.selector.rows.classList.remove('table-info');
        row.child.hide();
      } else {
        row.selector.rows.classList.add('table-info');
        row.child.show();
      }
    });
  });
}
