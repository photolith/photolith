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

  function doApply (data, order, searchCols) {
    setupMApi(searchCols || Object.keys(data[1]));
    setDTState('', { order });

    out = JSON.parse(JSON.stringify(data));
    applyDTState(out, global.window.location.search);
    return out;
  }
  let out;

  test.deepEqual(doApply([
    { nm_length: 1, in_year: 2 },
    { nm_length: 10, in_year: 3 },
    { nm_length: 3, in_year: 2 }
  ], [[0, 'desc']]), [
    { nm_length: 10, in_year: 3, __rowpos: 1 },
    { nm_length: 3, in_year: 2, __rowpos: 2 },
    { nm_length: 1, in_year: 2, __rowpos: 0 }
  ], 'Sorted by first column, descending');

  test.deepEqual(doApply([
    { nm_length: 1, in_year: 2 },
    { nm_length: 10, in_year: 3 },
    { nm_length: 3, in_year: 2 }
  ], [[1, 'asc']]), [
    { nm_length: 1, in_year: 2, __rowpos: 0 },
    { nm_length: 3, in_year: 2, __rowpos: 2 },
    { nm_length: 10, in_year: 3, __rowpos: 1 }
  ], 'Sorted by second column, then preserving original order');

  test.deepEqual(doApply([
    { nm_length: 1, in_year: 2 },
    { nm_length: 10, in_year: 3 },
    { nm_length: 3, in_year: 2 }
  ], [[1, 'asc'], [0, 'desc']]), [
    { nm_length: 3, in_year: 2, __rowpos: 2 },
    { nm_length: 1, in_year: 2, __rowpos: 0 },
    { nm_length: 10, in_year: 3, __rowpos: 1 }
  ], 'Sorted by second column, then first');

  test.deepEqual(doApply([
    { nm_length: 1, ch_gear: 'x' },
    { nm_length: 2, ch_gear: 'y' },
    { nm_length: 1, ch_gear: 'z' },
    { nm_length: 2, ch_gear: 'w' }
  ], [[0, 'desc']]), [
    { nm_length: 2, ch_gear: 'w', __rowpos: 3 },
    { nm_length: 2, ch_gear: 'y', __rowpos: 1 },
    { nm_length: 1, ch_gear: 'z', __rowpos: 2 },
    { nm_length: 1, ch_gear: 'x', __rowpos: 0 }
  ], 'Descending first sort reverses original order of ties (orderDescReverse)');

  test.deepEqual(doApply([
    { ch_cruise: 'cherry' },
    { ch_cruise: 'Ábót' },
    { ch_cruise: 'banana' }
  ], [[0, 'asc']]), [
    { ch_cruise: 'Ábót', __rowpos: 1 },
    { ch_cruise: 'banana', __rowpos: 2 },
    { ch_cruise: 'cherry', __rowpos: 0 }
  ], 'Strings sorted case-insensitively, accented characters alongside unaccented');

  test.deepEqual(doApply([
    { ch_slideLabel: 'TG1-2023-10' },
    { ch_slideLabel: 'TG1-2023-9' },
    { ch_slideLabel: 'TG1-2023-100' }
  ], [[0, 'asc']]), [
    { ch_slideLabel: 'TG1-2023-9', __rowpos: 1 },
    { ch_slideLabel: 'TG1-2023-10', __rowpos: 0 },
    { ch_slideLabel: 'TG1-2023-100', __rowpos: 2 }
  ], 'Numbers within strings sorted numerically');

  test.deepEqual(doApply([
    { dt_created_at: '2024-01-01T10:00:00+05:00' },
    { dt_created_at: '2024-01-01T06:00:00Z' },
    { dt_created_at: '2024-01-01T04:00:00.123Z' }
  ], [[0, 'asc']]), [
    { dt_created_at: '2024-01-01T04:00:00.123Z', __rowpos: 2 },
    { dt_created_at: '2024-01-01T10:00:00+05:00', __rowpos: 0 },
    { dt_created_at: '2024-01-01T06:00:00Z', __rowpos: 1 }
  ], 'Dates sorted by timestamp, not lexically');

  // Taxonomy columns (tx_) carry objects; renderMetaCell(..., 'sort') pulls data.id
  test.deepEqual(doApply([
    { tx_sex: { id: 3, en: 'Male' } },
    { tx_sex: { id: 1, en: 'Female' } },
    { tx_sex: { id: 2, en: 'Unknown' } }
  ], [[0, 'asc']]), [
    { tx_sex: { id: 1, en: 'Female' }, __rowpos: 1 },
    { tx_sex: { id: 2, en: 'Unknown' }, __rowpos: 2 },
    { tx_sex: { id: 3, en: 'Male' }, __rowpos: 0 }
  ], 'Taxonomy objects sort by id, not by English name');

  test.end();
});
