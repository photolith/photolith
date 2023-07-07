// https://datatables.net/download/npm
import DataTable from 'datatables.net-bs5';

import { croppedImageViewer } from './cropped_viewer';
import { renderMetaLabel, renderMetaCell } from './meta';

export function init (window) {
  window.document.querySelectorAll('.ph-search-table').forEach((elSearchTable) => {
    const lang = document.documentElement.lang || 'en';
    const metaLabels = window.mApi.metaLabels(lang);

    function childRow (row) {
      const el = document.createElement('DIV');
      el.append(croppedImageViewer(row.image, row.bounding_box, 'height: 300px;'));
      return el;
    }

    // https://datatables.net/reference/option/%24.fn.dataTable.ext.errMode
    DataTable.ext.errMode = 'throw';
    const table = new DataTable(elSearchTable, {
      // Load language from plugin: https://datatables.net/plug-ins/i18n/
      language: { url: lang !== 'en' ? `/static/datatables.net-plugins/i18n/${lang}.json` : undefined },
      ajaxSource: '/search/data/',
      columns: Object.keys(metaLabels).map((k) => {
        // https://datatables.net/reference/option/columns
        return {
          data: 'data.' + k,
          defaultContent: '',
          title: renderMetaLabel(metaLabels[k]),
          render: renderMetaCell
        };
      }),
      searching: false
    });

    table.on('click', 'td', function (e) {
      // https://datatables.net/reference/api/row().child
      const row = table.row(e.target.closest('tr'));

      // No row node found, was a click on a child row
      if (!row.node()) return;

      // Create child row if not already present
      if (!row.child() || row.child().length === 0) {
        row.child(childRow(row.data()));
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
