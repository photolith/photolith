import test from 'tape';

import { getLifecycle, txLifecycle } from '../src/lifecycle.js';

// Turn a list of labels into axis_poly points, null meaning no label
function pts (labels) {
  return labels.map((l, i) => l === null ? [i, i] : [i, i, l]);
}

const anadromous = { tx_lifecycle: { id: 1, en: 'Anadromous', is: 'Sjógenginn' } };
const scale = { tx_sampleType: { id: 2, en: 'Scale', is: 'Hreistur' } };
const otolith = { tx_sampleType: { id: 1, en: 'Otolith', is: 'Kvörn' } };

// CHARR_Mývatn_2007_000047_0047.mei: Its measures, length & Fishalysis' calculated F1..F4, F+
const charrPoints = [[1016, 841], [1032, 625, 'F1'], [1049, 421, 'F2'], [1053, 184, 'F3'], [1055, 58, 'F4'], [1055, 52, 'F+']];
const charrData = { ...scale, nm_length: 41.0 };
const charrFishalysis = [11.2358825182546, 21.8552374809919, 34.1515645917162, 40.6887449075467, 41.0];

function roundAll (arr, dp = 6) {
  return arr.map((x) => x === null ? null : Math.round(x * Math.pow(10, dp)) / Math.pow(10, dp));
}

test('getLifecycle', function (test) {
  const lcDefault = getLifecycle({});

  test.equal(typeof lcDefault.labelOptions, 'function', 'Default has labelOptions');
  test.equal(typeof lcDefault.age, 'function', 'Default has age');
  test.equal(typeof lcDefault.backCalc, 'function', 'Default has backCalc');
  test.equal(lcDefault.ageStages, undefined, 'Default has no ageStages');

  txLifecycle.forEach((tx) => {
    const lc = getLifecycle({ tx_lifecycle: tx });
    test.notEqual(lc.labelOptions, lcDefault.labelOptions, `${tx.en} has its own lifecycle`);
    test.equal(typeof lc.labelOptions, 'function', `${tx.en} has labelOptions`);
    test.equal(typeof lc.age, 'function', `${tx.en} has age`);
    test.equal(typeof lc.ageStages, 'function', `${tx.en} has ageStages`);
  });

  test.equal(getLifecycle({ tx_lifecycle: { id: 99, en: 'Parp' } }).labelOptions, lcDefault.labelOptions, 'Unknown tx_lifecycle uses default');
  test.equal(getLifecycle({ tx_lifecycle: {} }).labelOptions, lcDefault.labelOptions, 'tx_lifecycle without id uses default');
  test.equal(getLifecycle({ tx_species: { id: 1 } }).labelOptions, lcDefault.labelOptions, 'Other metadata uses default');
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

test('lifecycleAnadromous:labelOptions', function (test) {
  const lc = getLifecycle(anadromous);

  test.deepEqual(lc.labelOptions([]), [], 'No points, no options');
  test.deepEqual(lc.labelOptions(pts([null])), [[null]], 'Centre never has a label');
  test.deepEqual(lc.labelOptions(pts([null, null])), [[null], ['F+']], 'Single line ends at F+');
  test.deepEqual(
    lc.labelOptions(pts([null, null, null, null])),
    [[null], ['F1', 'F+'], ['F2', 'G1', 'F+'], ['F+']],
    'Unlabelled points continue counting freshwater years, spawning marks (G) can follow at least one, ending at F+'
  );
  test.deepEqual(
    lc.labelOptions(pts([null, 'F1', 'F+', null, null])),
    [[null], ['F1', 'F+'], ['F+', 'F2', 'G1'], ['S1'], ['S+']],
    'F+ moves on to sea (S) years, ending at S+'
  );
  test.deepEqual(
    lc.labelOptions(pts([null, 'F1', 'F2', 'F3', 'F4', 'F+'])),
    [[null], ['F1', 'F+'], ['F2', 'G1', 'F+'], ['F3', 'G1', 'F+'], ['F4', 'G1', 'F+'], ['F+']],
    'No sea (S) years, the reading ends at F+ (CHARR_Mývatn_2007_000047_0047.mei)'
  );
  test.deepEqual(
    lc.labelOptions(pts([null, 'F1', 'F2', 'F3', 'F4', 'F5', 'G1', 'G2', 'G3', 'F+'])),
    [[null], ['F1', 'F+'], ['F2', 'G1', 'F+'], ['F3', 'G1', 'F+'], ['F4', 'G1', 'F+'], ['F5', 'G1', 'F+'], ['G1', 'F6', 'F+'], ['G2', 'F6', 'F+'], ['G3', 'F6', 'F+'], ['F+']],
    'Freshwater spawning marks end at F+ (TROUT_Bæjartjörn_2025_000001_0001.mei)'
  );
  test.deepEqual(
    lc.labelOptions(pts([null, 'F1', 'F2', 'G1', null, 'F+', null])),
    [[null], ['F1', 'F+'], ['F2', 'G1', 'F+'], ['G1', 'F3', 'F+'], ['G2', 'F3', 'F+'], ['F+', 'G3', 'F3'], ['S+']],
    'Freshwater spawning marks return to F+, then sea (S) years'
  );
  test.deepEqual(
    lc.labelOptions(pts([null, 'F1', 'F+', 'S1', null, null])),
    [[null], ['F1', 'F+'], ['F+', 'F2', 'G1'], ['S1'], ['S2', 'G1'], ['S+']],
    'Spawning marks (G) can follow at least one sea year'
  );
  test.deepEqual(
    lc.labelOptions(pts([null, 'F1', 'F+', 'S1', 'G1', null, null])),
    [[null], ['F1', 'F+'], ['F+', 'F2', 'G1'], ['S1'], ['G1', 'S2'], ['G2', 'S2'], ['S+']],
    'G1 moves on to spawning marks, keeping G1 as first option'
  );
  test.deepEqual(
    lc.labelOptions(pts([null, 'F1', 'F+', 'S1', 'S+', null, null])),
    [[null], ['F1', 'F+'], ['F+', 'F2', 'G1'], ['S1'], ['S2', 'G1'], ['S3', 'G1'], ['S+']],
    'S+ is the edge, so only allowed as the final point'
  );
  test.deepEqual(
    lc.labelOptions(pts([null, 'F1', 'F2', 'F+', 'S1', 'F+'])),
    [[null], ['F1', 'F+'], ['F2', 'G1', 'F+'], ['F+', 'F3', 'G1'], ['S1'], ['S+']],
    'Final point after sea years has to be S+, not F+'
  );
  test.deepEqual(
    lc.labelOptions(pts([null, 'F1', 'F2', 'G1', 'G2'])),
    [[null], ['F1', 'F+'], ['F2', 'G1', 'F+'], ['G1', 'F3', 'F+'], ['F+']],
    'Final point after spawning marks is plus-growth, not another spawning mark'
  );
  test.deepEqual(
    lc.labelOptions(pts([null, 'F1', 'F2', 'F3', 'F4', 'F+', 'S1', 'G1', 'G2', 'S+'])),
    [[null], ['F1', 'F+'], ['F2', 'G1', 'F+'], ['F3', 'G1', 'F+'], ['F4', 'G1', 'F+'], ['F+', 'F5', 'G1'], ['S1'], ['G1', 'S2'], ['G2', 'S2'], ['S+']],
    'SALMON_Kjarrá_2011_000217_0001.mei is valid'
  );
  test.deepEqual(
    lc.labelOptions(pts([null, 'F1', 'F2', 'F3', 'F+', 'S1', 'S2', 'G1', 'G2', 'S+'])),
    [[null], ['F1', 'F+'], ['F2', 'G1', 'F+'], ['F3', 'G1', 'F+'], ['F+', 'F4', 'G1'], ['S1'], ['S2', 'G1'], ['G1', 'S3'], ['G2', 'S3'], ['S+']],
    'SEATROUT_Ölfusá_2012_000005_0001.mei is valid'
  );
  test.deepEqual(
    lc.labelOptions(pts([null, 'F1', 'F2', 'F3', 'F+', 'S1', 'G1', 'S2', 'S+'])),
    [[null], ['F1', 'F+'], ['F2', 'G1', 'F+'], ['F3', 'G1', 'F+'], ['F+', 'F4', 'G1'], ['S1'], ['G1', 'S2'], ['S2', 'G2'], ['S+']],
    'Sea years can follow spawning marks, continuing their count (SEATROUT_Ytri-Rangá_2010_000022_0001.mei)'
  );
  test.deepEqual(
    lc.labelOptions(pts([null, 'F1', 'F2', 'F3', 'F+', 'S1', 'S2', 'G1', 'S3', 'S+'])),
    [[null], ['F1', 'F+'], ['F2', 'G1', 'F+'], ['F3', 'G1', 'F+'], ['F+', 'F4', 'G1'], ['S1'], ['S2', 'G1'], ['G1', 'S3'], ['S3', 'G2'], ['S+']],
    'SEATROUT_Úlfarsá_2009_000015_0001.mei is valid'
  );
  test.deepEqual(
    lc.labelOptions(pts([null, 'F1', 'G1', 'F2', 'G2', 'F+'])),
    [[null], ['F1', 'F+'], ['G1', 'F2', 'F+'], ['F2', 'G2', 'F+'], ['G2', 'F3', 'F+'], ['F+']],
    'Freshwater years can follow spawning marks, which continue their count'
  );
  test.deepEqual(
    lc.labelOptions(pts([null, 'G1', 'F+', 'G1', 'S+'])),
    [[null], ['F1', 'F+'], ['F+', 'F2', 'G1'], ['S1'], ['S+']],
    'No spawning marks before a freshwater or sea year'
  );
  test.deepEqual(
    lc.labelOptions(pts([null, 'F+', 'S+'])),
    [[null], ['F+', 'F1'], ['S+']],
    'Counts restart at 1 for each stage'
  );
  test.deepEqual(
    lc.labelOptions(pts([null, 'S+', 'F+'])),
    [[null], ['F1', 'F+'], ['F+']],
    'S+ in freshwater stage does not move on'
  );
  test.end();
});

test('lifecycleAnadromous:age', function (test) {
  const lc = getLifecycle(anadromous);

  test.equal(lc.age([]), 0, 'No points, no age');
  test.equal(lc.age(pts([null])), 0, 'Centre is not counted');
  test.equal(lc.age(pts([null, 'F1', 'F2', 'F+', 'S1', 'G1', 'G2', 'S+'])), 5, 'F+ & S+ are not counted, spawning marks (G) are');
  test.equal(lc.age(pts([null, 'F1', 'F2', 'G1', 'F+'])), 3, 'Freshwater spawning marks (G) are counted');
  test.equal(lc.age(pts([null, 'F+', 'S+'])), 0, 'Only plus-growth, no age');
  test.equal(lc.age(pts([null, null, null])), 0, 'Unlabelled points are not counted');
  test.equal(lc.age(pts([null, 'F1', 'F+', 'S1', 'S+', null])), 2, 'Unlabelled point after the edge is not counted');

  test.equal(lc.age(charrPoints), 4, 'Mývatn charr is 4');
  test.end();
});

test('lifecycleAnadromous:ageStages', function (test) {
  const lc = getLifecycle(anadromous);

  test.deepEqual(lc.ageStages([]), { F: 0, G: 0 }, 'No points, freshwater with no years');
  test.deepEqual(lc.ageStages(pts([null, 'F1', 'F2', 'F3', 'F+'])), { F: 3, G: 0 }, 'No S labels, no sea stage');
  test.deepEqual(lc.ageStages(pts([null, 'F1', 'F2', 'G1', 'F+'])), { F: 2, G: 1 }, 'Freshwater spawning marks');
  test.deepEqual(lc.ageStages(pts([null, 'F1', 'F2', 'F+', 'S1', 'G1', 'G2', 'S+'])), { F: 2, S: 1, G: 2 }, 'F+ & S+ are not counted');
  test.deepEqual(lc.ageStages(pts([null, 'F1', 'F+', 'S+'])), { F: 1, S: 0, G: 0 }, 'S+ alone is a sea stage with no years');
  test.deepEqual(lc.ageStages(pts([null, 'F1', 'F+', 'S1', 'S+', null])), { F: 1, S: 1, G: 0 }, 'Unlabelled points are not counted');
  test.deepEqual(lc.ageStages(charrPoints), { F: 4, G: 0 }, 'Mývatn charr is 4 freshwater years');

  [
    [null, 'F1', 'F2', 'F+', 'S1', 'G1', 'G2', 'S+'],
    [null, 'F1', 'F2', 'G1', 'F+'],
    [null, 'F+', 'S+']
  ].forEach((labels) => {
    const stages = lc.ageStages(pts(labels));
    test.equal(Object.values(stages).reduce((a, b) => a + b, 0), lc.age(pts(labels)), `Stages of ${labels.join(' ')} add up to age`);
  });
  test.end();
});

test('getLifecycle:backCalc', function (test) {
  const bcDisabled = getLifecycle({}).backCalc;
  test.equal(bcDisabled([[0, 0], [3, 4], [6, 8]], { nm_length: 30 }), null, 'Default gives null');

  test.notEqual(getLifecycle(scale).backCalc, bcDisabled, 'Scales have a back-calculation');
  test.equal(getLifecycle(otolith).backCalc, bcDisabled, 'Otoliths use default');
  test.equal(getLifecycle({ tx_sampleType: {} }).backCalc, bcDisabled, 'tx_sampleType without id uses default');
  test.equal(getLifecycle({ tx_species: { id: 1 } }).backCalc, bcDisabled, 'Other metadata uses default');
  test.end();
});

test('backCalc:dahlLea', function (test) {
  const bc = getLifecycle(scale).backCalc;

  test.deepEqual(
    bc([[0, 0], [3, 4], [6, 8], [9, 12]], { ...scale, nm_length: 30 }),
    [0, 10, 20, 30],
    'Proportional to radius'
  );
  test.deepEqual(
    roundAll(bc([[0, 0], [3, 4], [3, 9]], { ...scale, nm_length: 10 })),
    roundAll([0, 10 * 5 / Math.sqrt(90), 10]),
    'Measured straight from the centre'
  );
  // NB: Fishalysis measured each radius along the path from point-to-point, rather than straight from the centre,
  // so its values differ from ours slightly. The more the points zig-zag, the bigger the difference
  test.deepEqual(
    roundAll(bc(charrPoints, charrData), 0),
    roundAll([0, ...charrFishalysis], 0),
    'Within a fraction of a cm of Fishalysis for a near-straight reading'
  );
  test.end();
});

test('backCalc:missing', function (test) {
  const bc = getLifecycle(scale).backCalc;

  test.equal(bc([[0, 0], [3, 4], [6, 8]], { ...scale, nm_length: 0 }), null, 'Zero length gives null');
  test.equal(bc([[0, 0], [3, 4], [6, 8]], { ...scale, nm_length: null }), null, 'No length gives null');
  test.equal(bc([[0, 0], [3, 4], [6, 8]], scale), null, 'Undefined length gives null');
  test.deepEqual(bc([[5, 5], [5, 5]], { ...scale, nm_length: 20 }), [null, null], 'No radius gives nulls');
  test.end();
});
