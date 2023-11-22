import test from 'tape';
import { setupDom } from './util_dom.js';

import { renderMetaCell } from '../src/meta.js';

test('renderMetaCell:other', function (test) {
  setupDom(test, '<html lang="ge"></html>');

  // Other modes just return value
  test.deepEqual(renderMetaCell('nm_number', 4, 'sort'), 4);

  // Taxonomies are resolved
  test.deepEqual(renderMetaCell('tx_sex', { id: 1, en: 'M', ge: 'მ' }, 'sort'), 'მ');
  test.deepEqual(renderMetaCell('tx_sex', { id: 2, en: 'F', ge: 'ფ' }, 'sort'), 'ფ');

  test.end();
});
