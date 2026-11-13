import DataTable from 'datatables.net-bs5';

import { metaDTType, registerDTTypes, renderMetaCell } from './meta.js';

const SEP_INNER = '.';
const SEP_OUTER = '-';

// Minimal stand-in for DT's settings object, as passed to type pre functions
// NB: Our i18n plugins all use the default decimal of ''
const DT_SETTINGS = { oLanguage: { sDecimal: '' } };

/** Pull DT state from querystring */
export function getDTState (searchString) {
  const searchParams = new URLSearchParams(searchString);
  const defaultState = window.mApi.searchDefaults();

  function getOrder () {
    if (!searchParams.has('order')) {
      // No order set yet, return default
      return defaultState.order || [];
    }
    return searchParams.get('order').split(SEP_OUTER).map((o) => {
      const parts = o.split(SEP_INNER, 2);

      return [parseInt(parts[0], 10), parts[1]];
    });
  }

  return {
    order: getOrder()
  };
}

/** replaceState the order into the querystring */
export function setDTState (searchString, data) {
  const searchParams = new URLSearchParams(searchString);

  if (data.order) {
    searchParams.set('order', data.order.map((o) => `${o[0]}${SEP_INNER}${o[1]}`).join(SEP_OUTER));
  } else {
    searchParams.delete('order');
  }

  window.history.replaceState(null, '', '?' + searchParams.toString());
}

/** Remove DT state from search (so we can send on to server */
export function removeDTState (searchString) {
  const searchParams = new URLSearchParams(searchString);

  searchParams.delete('order');
  return '?' + searchParams.toString();
}

/** Perform ordering as DT would have done */
export function applyDTState (data, searchString) {
  const dtState = getDTState(searchString);

  // NB: Under nodeJS, DataTable is a function that needs to be fed a window
  //     https://github.com/DataTables/Dist-DataTables-Bootstrap5/blob/7d09afc9038aaea5d8d045e18116d4d089203c9b/js/dataTables.bootstrap5.js#L21-L40
  const dt = DataTable.ext ? DataTable : DataTable(global.window);
  registerDTTypes(dt);
  const dtExt = dt.ext;

  // Array of column keys to sort by
  const colKeys = Object.keys(window.mApi.metaLabels('search_columns'));
  const orderKeys = dtState.order.map((o) => colKeys[o[0]]);

  // Array of directions each sort is in (asc/desc)
  const orderDir = dtState.order.map((o) => o[1]);

  // Find relevant formatter/order functions for each sort, based on column type (as search table uses)
  const orderTypes = orderKeys.map(metaDTType);
  const formatterFns = orderTypes.map((t) => dtExt.type.order[`${t}-pre`] || ((x) => x));
  const orderFns = orderTypes.map((t, i) => dtExt.type.order[`${t}-${orderDir[i]}`] || (orderDir[i] === 'desc'
    ? (a, b) => a < b ? 1 : a > b ? -1 : 0
    : (a, b) => a < b ? -1 : a > b ? 1 : 0));

  // Pre-format sort data & original row position for each row
  // NB: orderDescReverse is on by default, so if first sort is desc, original order is reversed
  const rowReverse = orderDir[0] === 'desc';
  for (let i = 0; i < data.length; i++) {
    data[i].__rowpos = i;
  }
  const sortData = new Map(data.map((row) => [row, orderKeys.map((k, i) => formatterFns[i](renderMetaCell(k, row[k], 'sort'), DT_SETTINGS))]));

  // Emulate datatables.net sorting
  // See: https://github.com/DataTables/DataTablesSrc/blob/master/js/core/core.sort.js#L207
  data.sort(function (rowA, rowB) {
    const sortA = sortData.get(rowA);
    const sortB = sortData.get(rowB);

    for (let i = 0; i < orderKeys.length; i++) {
      // Compare key in both rows, if not equal stop
      const rv = orderFns[i](sortA[i], sortB[i]);
      if (rv !== 0) return rv;
    }

    // Finally compare original row order to keep stable (aiOrig)
    return rowReverse ? rowB.__rowpos - rowA.__rowpos : rowA.__rowpos - rowB.__rowpos;
  });

  return data;
}
