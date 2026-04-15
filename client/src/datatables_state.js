import DataTable from 'datatables.net-bs5';

import { renderMetaCell } from './meta.js';

const SEP_INNER = '.';
const SEP_OUTER = '-';

/** Pull DT state from querystring */
export function getDTState (searchString, defaultState) {
  const searchParams = new URLSearchParams(searchString);

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
export function applyDTState (data, searchString, defaultState) {
  const dtState = getDTState(searchString, defaultState);

  // Under the browswer DataTable is pre-initalised, in tests we need to feed JSDOM into it
  const dtExt = DataTable.ext || DataTable(global.window, global.window.$).ext;

  // Array of column keys to sort by
  const colKeys = Object.keys(window.mApi.metaLabels('search_columns'));
  const orderKeys = dtState.order.map((o) => colKeys[o[0]]);

  // Array of directions each sort is in (asc/desc)
  const orderDir = dtState.order.map((o) => o[1]);

  // Find relevant formatter/order functions for each sort
  const genericPre = (x) => x;
  const genericSort = {
    asc: (a, b) => a < b ? -1 : a > b ? 1 : 0,
    desc: (a, b) => a < b ? 1 : a > b ? -1 : 0
  };
  const formatterFns = orderKeys.map((k) => dtExt.type.order[`${typeof datA}-pre`] || genericPre);
  const orderFns = orderKeys.map((k, i) => dtExt.type.order[`${typeof datA}-${orderDir[i]}`] || genericSort[orderDir[i]]);

  // Append each row position to data
  for (let i = 0; i < data.length; i++) {
    data[i].__rowpos = i;
  }

  // Emulate datatables.net sorting
  // See: https://github.com/DataTables/DataTablesSrc/blob/master/js/core/core.sort.js#L207
  data.sort(function (rowA, rowB) {
    for (let i = 0; i < orderKeys.length; i++) {
      const k = orderKeys[i];

      // Compare key in both rows, if not equal stop
      const rv = orderFns[i](
        formatterFns[i](renderMetaCell(k, rowA[k], 'sort')),
        formatterFns[i](renderMetaCell(k, rowB[k], 'sort'))
      );
      if (rv !== 0) return rv;
    }

    // Finally compare original row order to keep stable (aiOrig)
    return genericSort.asc(rowA.__rowpos, rowB.__rowpos);
  });

  return data;
}
