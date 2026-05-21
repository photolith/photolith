// https://datatables.net/download/npm
import DataTable from 'datatables.net-bs5';
import TomSelect from 'tom-select';

import { init as initCroppedViewer } from './cropped_viewer.js';
import { htmlFetch, jsonFetch } from './fetch.js';
import { renderMetaLabel, renderMetaCell, populateSearchFilters } from './meta.js';
import { getDTState, setDTState, removeDTState } from './datatables_state.js';

function filterChange (elForm, elTarget) {
  if (elTarget.classList.contains('range-start') || elTarget.classList.contains('range-end')) {
    const elOpposing = elTarget.classList.contains('range-start') ? elTarget.nextElementSibling.nextElementSibling : elTarget.previousElementSibling.previousElementSibling;

    // If input boxes matched before this event, they should stay matched
    if (elOpposing.value === elTarget.defaultValue) {
      elOpposing.value = elTarget.value;
    }
    // Use defaultValue to store old value for the next change event (reset reloads page, so not used otherwise)
    elTarget.defaultValue = elTarget.value;
  }
}

export function updateAnnotateUrl (containerEl) {
  containerEl.querySelectorAll('a[href*="/annotate/"]').forEach((el) => {
    // Add/update current search querystring to any annotate links
    // NB: Django doesn't have this when generating the snippet, and it changes on header-clicks
    const url = new URL(el.href);
    url.search = window.location.search;
    el.href = url.toString();
  });
}

export function init (parent) {
  parent.querySelectorAll('form.filter-form').forEach((elForm) => {
    const metaFields = JSON.parse(document.getElementById('meta_fields').textContent);
    const searchParams = new URLSearchParams(window.location.search);

    populateSearchFilters(elForm.querySelector('.offcanvas-body'), metaFields, searchParams);
    elForm.querySelectorAll(':scope .offcanvas-body select:not(.add-new-metadata)').forEach((el) => new TomSelect(el, {
    }));
    elForm.addEventListener('change', (event) => {
      filterChange(elForm, event.target);
    });
  });
  parent.querySelectorAll('.ph-search-table').forEach((elSearchTable) => {
    const lang = document.documentElement.lang || 'en';
    const metaLabels = window.mApi.metaLabels('search_columns');

    // https://datatables.net/reference/option/%24.fn.dataTable.ext.errMode
    DataTable.ext.errMode = 'throw';
    const table = new DataTable(elSearchTable, {
      // Load language from plugin: https://datatables.net/plug-ins/i18n/
      language: { url: lang === 'en-us' ? undefined : `/static/datatables.net-plugins/i18n/${lang.replace(/-\w*/, (x) => x.toUpperCase())}.json` },
      // Allow table to resize with browser
      autoWidth: false,
      ajax: function (data, callback) {
        // https://datatables.net/reference/option/ajax#Types
        return jsonFetch('/search/data/' + removeDTState(window.document.location.search), {}).then(callback);
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
      order: getDTState(window.location.search).order,
      stateSave: true,
      stateSaveCallback: function (settings, data) {
        setDTState(window.location.search, data);
        // Update visible children with new querystring
        table.rows({ page: 'current' }).every(function () {
          if (this.child.isShown()) {
            updateAnnotateUrl(this.child()[0]);
          }
          return undefined;
        });
      },
      stateLoadCallback: function (settings, callback) {
        callback(getDTState(window.location.search));
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
          updateAnnotateUrl(row.child()[0]);
          initCroppedViewer(row.child()[0]);
        });
      }

      // Open/close row
      if (row.child.isShown()) {
        row.selector.rows.classList.remove('table-info');
        row.child.hide();
      } else {
        row.selector.rows.classList.add('table-info');
        updateAnnotateUrl(row.child()[0]);
        row.child.show();
      }
    });
  });
}
