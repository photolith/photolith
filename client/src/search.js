// https://datatables.net/download/npm
import DataTable from 'datatables.net-bs5';

import { init as initCroppedViewer } from './cropped_viewer';
import { htmlFetch } from './fetch';
import { renderMetaLabel, renderMetaCell } from './meta';

export function init (parent) {
  parent.querySelectorAll('.ph-search-table').forEach((elSearchTable) => {
    const lang = document.documentElement.lang || 'en';
    const metaLabels = window.mApi.metaLabels(lang);

    // https://datatables.net/reference/option/%24.fn.dataTable.ext.errMode
    DataTable.ext.errMode = 'throw';
    const table = new DataTable(elSearchTable, {
      // Load language from plugin: https://datatables.net/plug-ins/i18n/
      language: { url: lang !== 'en' ? `/static/datatables.net-plugins/i18n/${lang}.json` : undefined },
      ajaxSource: '/search/data/' + window.document.location.search,
      columns: Object.keys(metaLabels).map((k) => {
        // https://datatables.net/reference/option/columns
        return {
          data: 'data.' + k,
          defaultContent: '',
          title: renderMetaLabel(metaLabels[k]),
          // https://datatables.net/reference/option/columns.createdCell
          createdCell: function (td, cellData) {
            if (typeof cellData === 'number') td.classList.add('text-end');
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
