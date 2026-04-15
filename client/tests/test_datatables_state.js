import test from 'tape';

import { setupDom } from './util_dom.js';

import { getDTState, setDTState, removeDTState, applyDTState } from '../src/datatables_state.js';

function setupState (test) {
  if (!global.window) {
    test.teardown(() => {
      global.window = undefined;
    });
    global.window = {};
  }

  global.window._url = '';
  global.window.history = {
    replaceState: function (state, unused, url) { global.window._url = url; }
  };
}

function setupMApi (searchCols) {
  if (!global.window) {
    test.teardown(() => {
      global.window = undefined;
    });
    global.window = {};
  }

  // Give each a pretty name
  const searchColDict = {};
  searchCols.forEach((x) => {
    searchColDict[x] = `Column ${x}`;
  });

  global.window.mApi = {};
  global.window.mApi.metaLabels = (x) => {
    return {
      search_columns: searchColDict
    }[x];
  };
  global.window.mApi.searchDefaults = () => {
    return {
      order: [[99, 'asc']]
    };
  };
}

test('setDTState', function (test) {
  setupState(test);

  setDTState('a=1&b=2', { order: [[1, 'asc'], [9, 'desc']] });
  test.deepEqual(global.window._url, '?a=1&b=2&order=1.asc-9.desc', 'order added to existing querystring');

  setDTState('', { order: [[22, 'desc']] });
  test.deepEqual(global.window._url, '?order=22.desc', 'order added to empty querystring');

  test.end();
});

test('getDTState', function (test) {
  setupState(test);
  setupMApi(['a', 'b', 'c']);

  function doLoopback (state, startUrl) {
    setDTState(startUrl || '', state);
    return getDTState(global.window._url);
  }

  test.deepEqual(doLoopback({}), { order: [[99, 'asc']] }, 'No order in state, return default');
  test.deepEqual(doLoopback({
    order: [[5, 'asc'], [4, 'asc'], [3, 'asc']]
  }), {
    order: [[5, 'asc'], [4, 'asc'], [3, 'asc']]
  }, 'Explicit state recreated');

  test.deepEqual(doLoopback({
    order: [[3, 'asc']]
  }), {
    order: [[3, 'asc']]
  }, 'Explicit state recreated');

  test.end();
});

test('removeDTState', function (test) {
  test.deepEqual(
    removeDTState('?a=1&order=1-asc&b=2'),
    '?a=1&b=2',
    'Order arg removed'
  );

  test.end();
});

test('applyDTState', function (test) {
  setupDom(test);
  setupMApi(['a', 'b', 'c']);

  function doApply (data, order, searchCols) {
    setupMApi(searchCols || Object.keys(data[1]));
    setDTState('', { order: order });

    out = JSON.parse(JSON.stringify(data));
    applyDTState(out, global.window.location.search);
    return out;
  }
  let out;

  test.deepEqual(doApply([
    { a: 1, b: 2 },
    { a: 10, b: 3 },
    { a: 3, b: 2 }
  ], [[0, 'desc']]), [
    { a: 10, b: 3, __rowpos: 1 },
    { a: 3, b: 2, __rowpos: 2 },
    { a: 1, b: 2, __rowpos: 0 }
  ], 'Sorted by first column, descending');

  test.deepEqual(doApply([
    { a: '1', b: 2 },
    { a: '10', b: 3 },
    { a: '3', b: 2 }
  ], [[0, 'desc']]), [
    { a: '3', b: 2, __rowpos: 2 },
    { a: '10', b: 3, __rowpos: 1 },
    { a: '1', b: 2, __rowpos: 0 }
  ], 'Sorted by first column, string order');

  test.deepEqual(doApply([
    { a: 1, b: 2 },
    { a: 10, b: 3 },
    { a: 3, b: 2 }
  ], [[1, 'asc']]), [
    { a: 1, b: 2, __rowpos: 0 },
    { a: 3, b: 2, __rowpos: 2 },
    { a: 10, b: 3, __rowpos: 1 }
  ], 'Sorted by second column, then preserving original order');

  test.deepEqual(doApply([
    { a: 1, b: 2 },
    { a: 10, b: 3 },
    { a: 3, b: 2 }
  ], [[1, 'asc'], [0, 'desc']]), [
    { a: 3, b: 2, __rowpos: 2 },
    { a: 1, b: 2, __rowpos: 0 },
    { a: 10, b: 3, __rowpos: 1 }
  ], 'Sorted by second column, then first');

  test.end();
});
