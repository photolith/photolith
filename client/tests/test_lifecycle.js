import test from 'tape';

import { getLifecycle, txLifecycle } from '../src/lifecycle.js';

// Turn a list of labels into axis_poly points, null meaning no label
function pts (labels) {
  return labels.map((l, i) => l === null ? [i, i] : [i, i, l]);
}

const freshwater = { tx_lifecycle: { id: 1, en: 'Freshwater', is: 'Staðbundinn' } };
const anadromous = { tx_lifecycle: { id: 2, en: 'Anadromous', is: 'Sjógenginn' } };

test('getLifecycle', function (test) {
  const lcDefault = getLifecycle({});

  test.equal(typeof lcDefault.labelOptions, 'function', 'Default has labelOptions');
  test.equal(typeof lcDefault.age, 'function', 'Default has age');

  txLifecycle.forEach((tx) => {
    const lc = getLifecycle({ tx_lifecycle: tx });
    test.notEqual(lc, lcDefault, `${tx.en} has its own lifecycle`);
    test.equal(typeof lc.labelOptions, 'function', `${tx.en} has labelOptions`);
    test.equal(typeof lc.age, 'function', `${tx.en} has age`);
  });

  test.equal(getLifecycle({ tx_lifecycle: { id: 99, en: 'Parp' } }), lcDefault, 'Unknown tx_lifecycle uses default');
  test.equal(getLifecycle({ tx_lifecycle: {} }), lcDefault, 'tx_lifecycle without id uses default');
  test.equal(getLifecycle({ tx_species: { id: 1 } }), lcDefault, 'Other metadata uses default');
  test.end();
});

test('lifecycleDefault:labelOptions', function (test) {
  const lc = getLifecycle({});

  test.deepEqual(lc.labelOptions([]), [], 'No points, no options');
  test.deepEqual(lc.labelOptions(pts([null])), [[null]], 'Centre never has a label');
  test.deepEqual(lc.labelOptions(pts([null, null])), [[null], ['E']], 'Single line has an end');
  test.deepEqual(
    lc.labelOptions(pts([null, null, null, null])),
    [[null], ['1'], ['2'], ['E']],
    'Points are numbered, ending in E'
  );
  test.deepEqual(
    lc.labelOptions(pts([null, 'F1', 'parp', 'G1'])),
    [[null], ['1'], ['2'], ['E']],
    'Existing labels are ignored'
  );
  test.end();
});

test('lifecycleDefault:age', function (test) {
  const lc = getLifecycle({});

  test.equal(lc.age([]), 0, 'No points, no age');
  test.equal(lc.age(pts([null])), 0, 'Centre only, no age');
  test.equal(lc.age(pts([null, null])), 0, 'Centre & end only, no rings');
  test.equal(lc.age(pts([null, null, null, null])), 2, 'Count all points between centre & end');
  test.equal(lc.age(pts([null, '1', 'F+', 'E'])), 2, 'Labels are ignored');
  test.end();
});

test('lifecycleFreshwater:labelOptions', function (test) {
  const lc = getLifecycle(freshwater);

  test.deepEqual(lc.labelOptions([]), [], 'No points, no options');
  test.deepEqual(lc.labelOptions(pts([null])), [[null]], 'Centre never has a label');
  test.deepEqual(
    lc.labelOptions(pts([null, null, null, null])),
    [[null], ['F1', 'F+'], ['F2', 'F+'], ['F3', 'F+']],
    'Unlabelled points continue counting freshwater years'
  );
  test.deepEqual(
    lc.labelOptions(pts([null, 'F1', 'F2', 'F+', null, null])),
    [[null], ['F1', 'F+'], ['F2', 'F+'], ['F+', 'F3'], ['G1'], ['G2']],
    'F+ moves on to growth (G) years, keeping F+ as first option'
  );
  test.deepEqual(
    lc.labelOptions(pts([null, 'F+', 'S+', null])),
    [[null], ['F+', 'F1'], ['G1'], ['G2']],
    'No sea (S) years'
  );
  test.end();
});

test('lifecycleFreshwater:age', function (test) {
  const lc = getLifecycle(freshwater);

  test.equal(lc.age([]), 0, 'No points, no age');
  test.equal(lc.age(pts([null])), 0, 'Centre is not counted');
  test.equal(lc.age(pts([null, 'F1', 'F2', 'F3'])), 3, 'Count all points apart from centre, including end');
  test.equal(lc.age(pts([null, 'F1', 'F2', 'F+', 'G1'])), 3, 'F+ is not counted');

  // CHARR_Mývatn_2007_000047_0047.mei, as per test_lengthatage.js
  test.equal(
    lc.age([[1016, 841], [1032, 625, 'F1'], [1049, 421, 'F2'], [1053, 184, 'F3'], [1055, 58, 'F4'], [1055, 52, 'F+']]),
    4,
    'Mývatn charr is 4'
  );
  test.end();
});

test('lifecycleAnadromous:labelOptions', function (test) {
  const lc = getLifecycle(anadromous);

  test.deepEqual(lc.labelOptions([]), [], 'No points, no options');
  test.deepEqual(lc.labelOptions(pts([null])), [[null]], 'Centre never has a label');
  test.deepEqual(
    lc.labelOptions(pts([null, null, null, null])),
    [[null], ['F1', 'F+'], ['F2', 'F+'], ['F3', 'F+']],
    'Unlabelled points continue counting freshwater years'
  );
  test.deepEqual(
    lc.labelOptions(pts([null, 'F1', 'F+', null, null])),
    [[null], ['F1', 'F+'], ['F+', 'F2'], ['S1', 'S+'], ['S2', 'S+']],
    'F+ moves on to sea (S) years'
  );
  test.deepEqual(
    lc.labelOptions(pts([null, 'F1', 'F+', 'S1', 'S+', null, null])),
    [[null], ['F1', 'F+'], ['F+', 'F2'], ['S1', 'S+'], ['S+', 'S2'], ['G1'], ['G2']],
    'S+ moves on to growth (G) years, keeping S+ as first option'
  );
  test.deepEqual(
    lc.labelOptions(pts([null, 'F+', 'S+', 'G1'])),
    [[null], ['F+', 'F1'], ['S+', 'S1'], ['G1']],
    'Counts restart at 1 for each stage'
  );
  test.deepEqual(
    lc.labelOptions(pts([null, 'S+', 'F+'])),
    [[null], ['F1', 'F+'], ['F+', 'F2']],
    'S+ in freshwater stage does not move on'
  );
  test.end();
});

test('lifecycleAnadromous:age', function (test) {
  const lc = getLifecycle(anadromous);

  test.equal(lc.age([]), 0, 'No points, no age');
  test.equal(lc.age(pts([null])), 0, 'Centre is not counted');
  test.equal(lc.age(pts([null, 'F1', 'F2', 'F+', 'S1', 'S+', 'G1', 'G2'])), 5, 'F+ & S+ are not counted, end is');
  test.equal(lc.age(pts([null, 'F+', 'S+'])), 0, 'Only plus-growth, no age');
  test.equal(lc.age(pts([null, null, null])), 2, 'Unlabelled points are counted');
  test.end();
});
