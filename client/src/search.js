// https://datatables.net/download/npm
import DataTable from 'datatables.net-bs5';

import { renderMetaLabel, renderMetaCell } from './meta';

export function init (window) {
  window.document.querySelectorAll('.ph-search-table').forEach((elSearchTable) => {
    const lang = document.documentElement.lang || 'en';
    const metaLabels = window.mApi.metaLabels(lang);

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
  });
}
