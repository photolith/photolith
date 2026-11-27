import test from 'tape';
import { readFileSync } from 'fs';
import { setupDom } from './util_dom.js';

import MetadataApi from '../src/metadata_api/hafro.js';

function mockFetch (routes) {
  return function (url) {
    const route = routes[url];
    if (!route) return Promise.reject(new Error(`No mock for ${url}`));
    return Promise.resolve({
      ok: route.status === undefined ? true : route.status < 400,
      status: route.status || 200,
      statusText: route.statusText || 'OK',
      json: () => Promise.resolve(route.json)
    });
  };
}

function setupHafroApi (test, { lang = 'en', baseHref = '' } = {}) {
  setupDom(test, `
    <html lang="${lang}"><body>
      <div id="alert-container"></div>
    </body></html>
  `);
  // displayAlert() schedules bootstrap.Alert on a timeout; stub so it doesn't blow up if it fires.
  global.window.bootstrap = { Alert: function () { return { close: () => {} }; } };
  return new MetadataApi(lang, baseHref);
}

test('MetadataApi(hafro):parseSlideLabel', function (test) {
  const mApi = setupHafroApi(test, {});

  test.deepEqual(mApi.parseSlideLabel('537572 TG1-2023/110 1 03'), {
    sampleId: 537572,
    cruise: 'TG1-2023',
    station: 110,
    species: 1,
    year: 2023,
    month: 3
  }, 'Full label parsed');

  test.deepEqual(mApi.parseSlideLabel('  537572 TG1-2023/110 1 03  '), {
    sampleId: 537572,
    cruise: 'TG1-2023',
    station: 110,
    species: 1,
    year: 2023,
    month: 3
  }, 'Surrounding whitespace tolerated');

  test.deepEqual(mApi.parseSlideLabel('537572 1'), {
    sampleId: 537572,
    species: 1
  }, 'Partial "(sampleId) (species)" parsed');

  test.deepEqual(mApi.parseSlideLabel('B17-79/25 9'), {
    cruise: 'B17-79',
    station: 25,
    species: 9,
    year: 79
  }, 'Partial "(cruise)/(station) (species)" parsed');

  test.throws(
    () => mApi.parseSlideLabel('nonsense'),
    /isn't recognisable as a slide label/,
    'Unparseable label throws'
  );

  // Icelandic translation of the error
  const isApi = setupHafroApi(test, { lang: 'is' });
  test.throws(
    () => isApi.parseSlideLabel('nonsense'),
    /Kannast ekki við/,
    'Error is translated for is'
  );

  test.end();
});

test('MetadataApi(hafro):urlFor', function (test) {
  const mApi = setupHafroApi(test, {});

  test.equal(
    mApi.urlFor({ sampleId: 537572, species: 1 }),
    '/biota/otolith/sample/537572/combined/filter?speciesNo=1',
    'sampleId + species URL'
  );

  test.equal(
    mApi.urlFor({ cruise: 'TG1-2023', station: 110, species: 1 }),
    '/biota/otolith/sample/combined/filter?speciesNo=1&cruise=TG1-2023&stationNo=110',
    'cruise/station/species URL'
  );

  // sampleId + species preferred when both forms are possible
  test.equal(
    mApi.urlFor({ sampleId: 537572, cruise: 'TG1-2023', station: 110, species: 1 }),
    '/biota/otolith/sample/537572/combined/filter?speciesNo=1',
    'sampleId form preferred when both available'
  );

  test.throws(
    () => mApi.urlFor({ sampleId: 537572 }),
    /Not enough data available for API query/,
    'Missing species throws'
  );

  test.end();
});

test('MetadataApi(hafro):sampleDetail maps individuals', async function (test) {
  const mApi = setupHafroApi(test, {});

  global.window.fetch = mockFetch({
    '/biota/otolith/sample/537572/combined/filter?speciesNo=1': {
      json: {
        otoliths: [
          // Deliberately out of order to verify sorting by serialNo
          {
            serialNo: 2,
            sampleId: 537572,
            measureId: 222,
            measureDTO: { length: 55, sexNo: 2, sexualMaturity: { sexualMaturityId: 3, sexualMaturityNo: 3 } },
            speciesDTO: { id: 1, englishName: 'Cod', code3a: 'COD', name: 'Þorskur' },
            sampleResponse: {
              station: {
                cruise: { name: 'TG1-2023' },
                number: 110,
                stationDate: '2023-03-15'
              },
              gear: { isscfgNo: 'PT1' },
              meshSize: 32
            }
          },
          {
            serialNo: 1,
            sampleId: 537572,
            measureId: 111,
            measureDTO: { length: 42, sexNo: 1, sexualMaturity: { sexualMaturityId: 2, sexualMaturityNo: 2 } },
            speciesDTO: { id: 1, englishName: 'Cod', code3a: 'COD', name: 'Þorskur' },
            sampleResponse: {
              station: {
                cruise: { name: 'TG1-2023' },
                number: 110,
                stationDate: '2023-03-15'
              },
              gear: { isscfgNo: 'PT1' },
              meshSize: 32
            }
          }
        ]
      }
    }
  });

  const out = await mApi.sampleDetail('537572 TG1-2023/110 1 03');

  test.equal(out.length, 2, 'One entry per otolith');
  test.equal(out[0].ch_individualLabel, '1', 'Sorted by serialNo');
  test.equal(out[1].ch_individualLabel, '2', 'Sorted by serialNo');

  test.deepEqual(out[0], {
    ch_slideLabel: '537572 TG1-2023/110 1 03',
    nm_length: 42,
    tx_sex: { id: 1, en: 'Male [M]', is: 'Hængur' },
    tx_maturity: { id: 2, en: 'COD/2', is: 'COD/2' },
    tx_species: { id: 1, en: 'Cod [COD]', is: 'Þorskur [COD]' },
    ch_cruise: 'TG1-2023',
    in_station: 110,
    dt_stationDate: '2023-03-15',
    in_year: 2023,
    in_month: 3,
    ch_gear: 'PT1',
    nm_meshSize: 32,
    tx_sampleType: { id: 1, en: 'Otolith', is: 'Kvörn' },
    in_sampleId: 537572,
    in_measureId: 111,
    ch_individualLabel: '1'
  }, 'First individual mapped');

  test.equal(out[1].tx_sex.id, 2, 'Female sex mapped from txHardcoded');
  test.equal(out[1].nm_length, 55, 'Length carried through');

  test.end();
});

test('MetadataApi(hafro):sampleDetail with canned API response', async function (test) {
  const mApi = setupHafroApi(test, {});

  // Output of /biota/otolith/sample/512350/combined/filter?speciesNo=1, from biota.internal.hafogvatn.cloud
  const cannedJson = JSON.parse(readFileSync(new URL('./fixtures/hafro_sample_512350_species_1.json', import.meta.url)));
  global.window.fetch = mockFetch({
    '/biota/otolith/sample/512350/combined/filter?speciesNo=1': { json: cannedJson }
  });

  const slideLabel = '512350 B12-2020/1438 1 11';
  const common = {
    ch_slideLabel: slideLabel,
    tx_species: { id: 1, en: 'Cod [COD]', is: 'Þorskur [COD]' },
    ch_cruise: 'B12-2020',
    in_station: 1438,
    dt_stationDate: '2020-11-04T00:00:00Z',
    in_year: 2020,
    in_month: 11,
    ch_gear: '0312',
    nm_meshSize: 40,
    tx_sampleType: { id: 1, en: 'Otolith', is: 'Kvörn' },
    in_sampleId: 512350
  };
  const male = { id: 1, en: 'Male [M]', is: 'Hængur' };
  const female = { id: 2, en: 'Female [F]', is: 'Hrygna' };
  const expected = [
    { ...common, nm_length: 52, tx_sex: male, tx_maturity: { id: 5, en: 'COD/5', is: 'COD/5' }, in_measureId: 21268544, ch_individualLabel: '1' },
    { ...common, nm_length: 64, tx_sex: female, tx_maturity: { id: 4, en: 'COD/4', is: 'COD/4' }, in_measureId: 21268537, ch_individualLabel: '2' },
    { ...common, nm_length: 71, tx_sex: male, tx_maturity: { id: 4, en: 'COD/4', is: 'COD/4' }, in_measureId: 21268536, ch_individualLabel: '3' },
    { ...common, nm_length: 27, tx_sex: female, tx_maturity: { id: 1, en: 'COD/1', is: 'COD/1' }, in_measureId: 21268507, ch_individualLabel: '4' },
    { ...common, nm_length: 27, tx_sex: female, tx_maturity: { id: 1, en: 'COD/1', is: 'COD/1' }, in_measureId: 21268506, ch_individualLabel: '5' }
  ];

  test.deepEqual(await mApi.sampleDetail(slideLabel), expected, 'All individuals mapped from canned response');
  test.equal(global.document.getElementById('alert-container').children.length, 0, 'No label mismatch warning');

  // Partial label gets the rest from sampleResponse, and the full label is rebuilt
  test.deepEqual(await mApi.sampleDetail('512350 1'), expected, 'Partial label filled in from sampleResponse');
  const alerts = global.document.getElementById('alert-container').children;
  test.equal(alerts.length, 1, 'Warning displayed for partial label');
  test.ok(alerts[0].innerHTML.includes('512350 B12-2020/1438 1 11'), 'Warning shows the full label');

  test.end();
});

test('MetadataApi(hafro):sampleDetail with canned API response, sexualMaturity', async function (test) {
  const mApi = setupHafroApi(test, {});

  // Output of /biota/otolith/sample/551229/combined/filter?speciesNo=3, from biota.internal.hafogvatn.cloud
  const cannedJson = JSON.parse(readFileSync(new URL('./fixtures/hafro_sample_551229_species_3.json', import.meta.url)));
  global.window.fetch = mockFetch({
    '/biota/otolith/sample/551229/combined/filter?speciesNo=3': { json: cannedJson }
  });

  const slideLabel = '551229 AJUN-2024/14 3 06';
  const common = {
    ch_slideLabel: slideLabel,
    tx_species: { id: 3, en: 'Saithe [POK]', is: 'Ufsi [POK]' },
    ch_cruise: 'AJUN-2024',
    in_station: 14,
    dt_stationDate: '2024-06-13T00:00:00Z',
    in_year: 2024,
    in_month: 6,
    ch_gear: '0910',
    nm_meshSize: undefined, // NB: Not recorded for this sample
    tx_sampleType: { id: 1, en: 'Otolith', is: 'Kvörn' },
    in_sampleId: 551229
  };
  const sexes = {
    1: { id: 1, en: 'Male [M]', is: 'Hængur' },
    2: { id: 2, en: 'Female [F]', is: 'Hrygna' }
  };

  // NB: Unlike cod, sexualMaturityId differs from sexualMaturityNo, the label should use the latter
  const maturityNo = { 19: 1, 20: 2, 22: 4, 27: 52 };
  const out = await mApi.sampleDetail(slideLabel);
  test.deepEqual(out, [
    // [length, sexNo, sexualMaturityId]
    [78, 2, 22], [75, 2, 19], [76, 1, 19], [82, 2, 27], [69, 1, 22],
    [73, 2, 19], [73, 2, 19], [66, 2, 22], [75, 2, 19], [77, 1, 20],
    [75, 2, 19], [72, 1, 22], [72, 1, 22], [65, 1, 22], [63, 2, 19],
    [77, 2, 22], [77, 1, 22], [73, 2, 19], [66, 2, 19], [69, 2, 19]
  ].map(([length, sexNo, maturityId], i) => ({
    ...common,
    nm_length: length,
    tx_sex: sexes[sexNo],
    tx_maturity: { id: maturityId, en: `POK/${maturityNo[maturityId]}`, is: `POK/${maturityNo[maturityId]}` },
    in_measureId: 24432421 + i,
    ch_individualLabel: (i + 1).toString()
  })), 'All individuals mapped from canned response');
  test.equal(global.document.getElementById('alert-container').children.length, 0, 'No label mismatch warning');

  test.end();
});

test('MetadataApi(hafro):sampleDetail unknown sex falls back', async function (test) {
  const mApi = setupHafroApi(test, {});

  global.window.fetch = mockFetch({
    '/biota/otolith/sample/537572/combined/filter?speciesNo=1': {
      json: {
        otoliths: [{
          serialNo: 1,
          sampleId: 537572,
          measureId: 111,
          measureDTO: { length: 10, sexNo: 42, sexualMaturity: { sexualMaturityId: 1, sexualMaturityNo: 1 } },
          speciesDTO: { id: 1, englishName: 'Cod', code3a: 'COD', name: 'Þorskur' },
          sampleResponse: {
            station: { cruise: { name: 'TG1-2023' }, number: 110, stationDate: '2023-03-15' },
            gear: { isscfgNo: 'PT1' },
            meshSize: 32
          }
        }]
      }
    }
  });

  const out = await mApi.sampleDetail('537572 TG1-2023/110 1 03');
  test.deepEqual(out[0].tx_sex, { id: 42, en: 'Unknown' }, 'Unknown sexNo becomes a placeholder tx');

  test.end();
});

test('MetadataApi(hafro):sampleDetail missing maturity / gear', async function (test) {
  const mApi = setupHafroApi(test, {});

  global.window.fetch = mockFetch({
    '/biota/otolith/sample/537572/combined/filter?speciesNo=1': {
      json: {
        otoliths: [{
          serialNo: 1,
          sampleId: 537572,
          measureId: 111,
          measureDTO: { length: 10, sexNo: 1, sexualMaturity: null },
          speciesDTO: { id: 1, englishName: 'Cod', code3a: 'COD', name: 'Þorskur' },
          sampleResponse: {
            station: { cruise: { name: 'TG1-2023' }, number: 110, stationDate: '2023-03-15' },
            gear: null,
            meshSize: 32
          }
        }, {
          serialNo: 2,
          sampleId: 537572,
          measureId: 112,
          measureDTO: { length: 12, sexNo: 1, sexualMaturity: { sexualMaturityId: 2, sexualMaturityNo: 2 } },
          speciesDTO: { id: 1, englishName: 'Cod', code3a: 'COD', name: 'Þorskur' },
          sampleResponse: {
            station: { cruise: { name: 'TG1-2023' }, number: 110, stationDate: '2023-03-15' },
            gear: { isscfgNo: 'PT1' },
            meshSize: 32
          }
        }]
      }
    }
  });

  const out = await mApi.sampleDetail('537572 TG1-2023/110 1 03');
  test.equal(out.length, 2, 'Both individuals returned');
  test.equal(out[0].tx_maturity, undefined, 'No maturity when API has none');
  test.equal(out[0].ch_gear, undefined, 'No gear when API has none');
  test.equal(out[0].nm_length, 10, 'Rest of individual still mapped');
  test.deepEqual(out[1].tx_maturity, { id: 2, en: 'COD/2', is: 'COD/2' }, 'Maturity mapped when present');
  test.equal(out[1].ch_gear, 'PT1', 'Gear mapped when present');

  test.end();
});

test('MetadataApi(hafro):sampleDetail unwraps single-element array response', async function (test) {
  const mApi = setupHafroApi(test, {});

  global.window.fetch = mockFetch({
    '/biota/otolith/sample/537572/combined/filter?speciesNo=1': {
      json: [{
        otoliths: [{
          serialNo: 1,
          sampleId: 537572,
          measureId: 111,
          measureDTO: { length: 42, sexNo: 1, sexualMaturity: { sexualMaturityId: 2, sexualMaturityNo: 2 } },
          speciesDTO: { id: 1, englishName: 'Cod', code3a: 'COD', name: 'Þorskur' },
          sampleResponse: {
            station: { cruise: { name: 'TG1-2023' }, number: 110, stationDate: '2023-03-15' },
            gear: { isscfgNo: 'PT1' },
            meshSize: 32
          }
        }]
      }]
    }
  });

  const out = await mApi.sampleDetail('537572 TG1-2023/110 1 03');
  test.equal(out.length, 1, 'Array-wrapped response is unwrapped');
  test.equal(out[0].in_sampleId, 537572, 'Individual data mapped from unwrapped response');

  test.end();
});

test('MetadataApi(hafro):sampleDetail no otoliths throws', async function (test) {
  const mApi = setupHafroApi(test, {});

  global.window.fetch = mockFetch({
    '/biota/otolith/sample/537572/combined/filter?speciesNo=1': {
      json: { otoliths: [] }
    }
  });

  try {
    await mApi.sampleDetail('537572 1');
    test.fail('expected error');
  } catch (e) {
    test.ok(/No otoliths for sample ID/.test(e.message), 'Empty otoliths list throws');
  }

  test.end();
});

test('MetadataApi(hafro):sampleDetail too many otoliths throws', async function (test) {
  const mApi = setupHafroApi(test, {});

  const otoliths = Array.from({ length: 501 }, (_, i) => ({
    serialNo: i + 1,
    sampleId: 537572,
    measureId: i + 1,
    measureDTO: { length: 1, sexNo: 1, sexualMaturity: { sexualMaturityId: 1, sexualMaturityNo: 1 } },
    speciesDTO: { id: 1, englishName: 'Cod', code3a: 'COD', name: 'Þorskur' },
    sampleResponse: {
      station: { cruise: { name: 'TG1-2023' }, number: 110, stationDate: '2023-03-15' },
      gear: { isscfgNo: 'PT1' },
      meshSize: 32
    }
  }));
  global.window.fetch = mockFetch({
    '/biota/otolith/sample/537572/combined/filter?speciesNo=1': {
      json: { otoliths }
    }
  });

  try {
    await mApi.sampleDetail('537572 1');
    test.fail('expected error');
  } catch (e) {
    test.ok(/Too many \(501\) otoliths/.test(e.message), 'Overly large otolith list throws');
  }

  test.end();
});

test('MetadataApi(hafro):sampleDetail warns on mismatched reconstructed label', async function (test) {
  const mApi = setupHafroApi(test, {});

  global.window.fetch = mockFetch({
    '/biota/otolith/sample/537572/combined/filter?speciesNo=1': {
      json: {
        otoliths: [{
          serialNo: 1,
          sampleId: 537572,
          measureId: 111,
          measureDTO: { length: 42, sexNo: 1, sexualMaturity: { sexualMaturityId: 2, sexualMaturityNo: 2 } },
          speciesDTO: { id: 1, englishName: 'Cod', code3a: 'COD', name: 'Þorskur' },
          sampleResponse: {
            station: { cruise: { name: 'TG1-2023' }, number: 999, stationDate: '2023-03-15' },
            gear: { isscfgNo: 'PT1' },
            meshSize: 32
          }
        }, {
          serialNo: 2,
          sampleId: 537572,
          measureId: 222,
          measureDTO: { length: 43, sexNo: 1, sexualMaturity: { sexualMaturityId: 2, sexualMaturityNo: 2 } },
          speciesDTO: { id: 1, englishName: 'Cod', code3a: 'COD', name: 'Þorskur' },
          sampleResponse: {
            station: { cruise: { name: 'TG1-2023' }, number: 999, stationDate: '2023-03-15' },
            gear: { isscfgNo: 'PT1' },
            meshSize: 32
          }
        }]
      }
    }
  });

  const out = await mApi.sampleDetail('537572 TG1-2023/110 1 03');
  test.equal(out[0].ch_slideLabel, '537572 TG1-2023/999 1 03', 'Reconstructed label reflects API data');

  const alerts = global.document.getElementById('alert-container').children;
  test.equal(alerts.length, 1, 'Single warning displayed (suppressed for subsequent individuals)');
  test.ok(/API returned a slide label of/.test(alerts[0].innerHTML), 'Warning describes the label mismatch');

  test.end();
});

test('MetadataApi(hafro):sampleDetail insufficient reconstruction info throws', async function (test) {
  const mApi = setupHafroApi(test, {});

  global.window.fetch = mockFetch({
    '/biota/otolith/sample/537572/combined/filter?speciesNo=1': {
      json: {
        otoliths: [{
          serialNo: 1,
          sampleId: 537572,
          measureId: 111,
          measureDTO: { length: 42, sexNo: 1, sexualMaturity: { sexualMaturityId: 2, sexualMaturityNo: 2 } },
          speciesDTO: { id: 1, englishName: 'Cod', code3a: 'COD', name: 'Þorskur' }
          // No sampleResponse; label was partial "537572 1" so lbl also lacks cruise/station/month
        }]
      }
    }
  });

  try {
    await mApi.sampleDetail('537572 1');
    test.fail('expected error');
  } catch (e) {
    test.ok(/Not enough information from API/.test(e.message), 'Missing cruise/station/month throws');
  }

  test.end();
});

test('MetadataApi(hafro):sampleDetail falls back to prompt for unparseable label', async function (test) {
  const mApi = setupHafroApi(test, {});

  global.window.fetch = () => Promise.reject(new Error('fetch should not be called'));
  global.window.prompt = () => '3';

  const out = await mApi.sampleDetail('unrecognisable label');
  test.equal(out.length, 3, 'Three individuals generated from prompt');
  test.deepEqual(out.map((o) => o.ch_individualLabel), [1, 2, 3], 'Numbered 1..N');
  test.equal(out[0].ch_slideLabel, 'unrecognisable label', 'Raw label carried through');

  test.end();
});

test('MetadataApi(hafro):sampleDetail rethrows parse error when prompt cancelled', async function (test) {
  const mApi = setupHafroApi(test, {});

  global.window.fetch = () => Promise.reject(new Error('fetch should not be called'));
  global.window.prompt = () => null;

  try {
    await mApi.sampleDetail('unrecognisable label');
    test.fail('expected error');
  } catch (e) {
    test.ok(/isn't recognisable as a slide label/.test(e.message), 'Original parse error rethrown when user cancels');
  }

  test.end();
});

test('MetadataApi(hafro):sampleDetail wraps fetch failure', async function (test) {
  const mApi = setupHafroApi(test, {});

  global.window.fetch = mockFetch({
    '/biota/otolith/sample/537572/combined/filter?speciesNo=1': {
      status: 500,
      statusText: 'Internal Server Error'
    }
  });

  try {
    await mApi.sampleDetail('537572 1');
    test.fail('expected error');
  } catch (e) {
    test.ok(/Fetching .* failed \(500\)/.test(e.message), 'Non-2xx fetch response surfaces intlError');
  }

  test.end();
});
