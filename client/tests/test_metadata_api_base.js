import test from 'tape';
import { setupDom } from './util_dom.js';

import MetadataApi from '../src/metadata_api/base.js';

function createMetadataApi (test, { lang = 'en', baseHref, txServer = {}, txHardcoded = {} }) {
  setupDom(test, `
    <html lang="${lang}"><body>
      <script id="full_taxonomy" type="application/json">${JSON.stringify(txServer)}</script>
    </body></html>
  `);
  const mApi = new MetadataApi(lang, baseHref);
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
