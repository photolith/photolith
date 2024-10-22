import test from 'tape';
import { setupDom } from './util_dom.js';

import MetadataApi from '../src/metadata_api/base.js';

function createMetadataApi (test, { lang = 'en', baseHref, txServer = {}, intlTemplates = {}, metaLabels = {}, fieldsFor = {}, txHardcoded = {} }) {
  setupDom(test, `
    <html lang="${lang}"><body>
      <script id="full_taxonomy" type="application/json">${JSON.stringify(txServer)}</script>
    </body></html>
  `);
  const mApi = new MetadataApi(lang, baseHref);
  mApi.intlExtend(mApi._intlTemplates, intlTemplates);
  mApi.intlExtend(mApi._metaLabels, metaLabels);
  mApi._fieldsFor = fieldsFor;
  mApi._txHardcoded = txHardcoded;
  return mApi;
}

test('MetadataApi:txFor', function (test) {
  let mApi;
  mApi = createMetadataApi(test, {});

  // Nothing available yet
  test.deepEqual(mApi.txFor('species'), {});

  // Can still see current value, if provided
  test.deepEqual(mApi.txFor('species', { id: 4, en: 'current', fr: 'currant' }), {
    4: { id: 4, en: 'current', fr: 'currant' }
  });

  // Set txServer & txHardcoded
  mApi = createMetadataApi(test, {
    txServer: {
      species: [
        { id: 1, en: 'Cod [COD]', is: '\u00deorskur [COD]' },
        { id: 2, en: 'Haddock [HAD]', is: '\u00ddsa [HAD]' },
        { id: 3, en: 'Saithe [POK]', is: 'Ufsi [POK]' }
      ],
      sex: [
        // NB: Values overriden
        { id: 1, en: 'M.', is: 'Ka.' },
        { id: 2, en: 'F.', is: 'Kv.' }
      ]
    },
    txHardcoded: {
      sex: [
        { id: 1, en: 'Male [M]', is: 'Karlkyns [M]' },
        { id: 2, en: 'Female [F]', is: 'Kvenkyns [F]' },
        { id: 3, en: 'Mixed [X]', is: 'Blandað [X]' }
      ]
    }
  });

  // Server overrides hardcoded
  test.deepEqual(mApi.txFor('species'), {
    1: { id: 1, en: 'Cod [COD]', is: '\u00deorskur [COD]' },
    2: { id: 2, en: 'Haddock [HAD]', is: '\u00ddsa [HAD]' },
    3: { id: 3, en: 'Saithe [POK]', is: 'Ufsi [POK]' }
  });
  test.deepEqual(mApi.txFor('sex'), {
    1: { id: 1, en: 'M.', is: 'Ka.' },
    2: { id: 2, en: 'F.', is: 'Kv.' },
    3: { id: 3, en: 'Mixed [X]', is: 'Blandað [X]' }
  });

  // Can override again with current
  test.deepEqual(mApi.txFor('sex', { id: 2, en: 'current', fr: 'currant' }), {
    1: { id: 1, en: 'M.', is: 'Ka.' },
    2: { id: 2, en: 'current', fr: 'currant' },
    3: { id: 3, en: 'Mixed [X]', is: 'Blandað [X]' }
  });

  // Other IDs just go on the end
  test.deepEqual(mApi.txFor('sex', { id: 99, en: 'current', fr: 'currant' }), {
    1: { id: 1, en: 'M.', is: 'Ka.' },
    2: { id: 2, en: 'F.', is: 'Kv.' },
    3: { id: 3, en: 'Mixed [X]', is: 'Blandað [X]' },
    99: { id: 99, en: 'current', fr: 'currant' }
  });

  test.end();
});

test('MetadataApi:metaLabels', function (test) {
  let mApi;
  const mApiOpts = {
    metaLabels: {
      en: {
        ch_eyes: 'Eyes',
        ch_nose: 'Nose',
        ch_mouth: 'Mouth',
        ch_elbow: 'Elbow',
        ch_toe: 'Toe'
      },
      es: {
        ch_eyes: 'Ojos',
        ch_nose: 'Nariz',
        ch_mouth: 'Boca',
        ch_elbow: 'Codo',
        ch_toe: 'Dedo del pie'
      }
    },
    fieldsFor: { search_columns: ['ch_eyes', 'ch_nose', 'ch_mouth'] }
  };

  // Default, returns everything in correct language, or en if we don't have it
  mApi = createMetadataApi(test, Object.assign({}, mApiOpts, { lang: 'en-gb' }));
  test.deepEqual(mApi.metaLabels(), {
    ch_slideLabel: 'Slide Label',
    ch_individualLabel: 'Individual No.',
    ch_eyes: 'Eyes',
    ch_nose: 'Nose',
    ch_mouth: 'Mouth',
    ch_elbow: 'Elbow',
    ch_toe: 'Toe'
  });
  mApi = createMetadataApi(test, Object.assign({}, mApiOpts, { lang: 'es' }));
  test.deepEqual(mApi.metaLabels(), {
    ch_eyes: 'Ojos',
    ch_nose: 'Nariz',
    ch_mouth: 'Boca',
    ch_elbow: 'Codo',
    ch_toe: 'Dedo del pie'
  });
  mApi = createMetadataApi(test, Object.assign({}, mApiOpts, { lang: 'ge' }));
  test.deepEqual(mApi.metaLabels(), {
    ch_slideLabel: 'Slide Label',
    ch_individualLabel: 'Individual No.',
    ch_eyes: 'Eyes',
    ch_nose: 'Nose',
    ch_mouth: 'Mouth',
    ch_elbow: 'Elbow',
    ch_toe: 'Toe'
  });

  // Can filter with fields_for, fall back to everything
  mApi = createMetadataApi(test, Object.assign({}, mApiOpts, {}));
  test.deepEqual(mApi.metaLabels('search_columns'), {
    ch_eyes: 'Eyes',
    ch_nose: 'Nose',
    ch_mouth: 'Mouth'
  });
  test.deepEqual(mApi.metaLabels('some_unknown_value'), {
    ch_slideLabel: 'Slide Label',
    ch_individualLabel: 'Individual No.',
    ch_eyes: 'Eyes',
    ch_nose: 'Nose',
    ch_mouth: 'Mouth',
    ch_elbow: 'Elbow',
    ch_toe: 'Toe'
  });

  test.end();
});
