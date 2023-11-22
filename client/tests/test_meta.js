import test from 'tape';

import { setupDom } from './util_dom.js';

import { renderMetaCell } from '../src/meta.js';
import MetadataApi from '../src/metadata_api/base.js';

test('renderMetaCell:undefined', function (test) {
  setupDom(test, '<html lang="ge"></html>');

  // Return value unadultered
  test.deepEqual(renderMetaCell('nm_number', 4), 4);
  test.deepEqual(renderMetaCell('tx_sex', { id: 1, en: 'M', ge: 'მ' }), { id: 1, en: 'M', ge: 'მ' });

  test.end();
});

test('renderMetaCell:sort', function (test) {
  setupDom(test, '<html lang="ge"></html>');

  // Other modes just return value
  test.deepEqual(renderMetaCell('nm_number', 4, 'sort'), 4);

  // Taxonomies return their ID
  test.deepEqual(renderMetaCell('tx_sex', { id: 1, en: 'M', ge: 'მ' }, 'sort'), 1);
  test.deepEqual(renderMetaCell('tx_sex', { id: 2, en: 'F', ge: 'ფ' }, 'sort'), 2);

  test.end();
});

test('renderMetaCell:filter', function (test) {
  setupDom(test, '<html lang="ge"></html>');

  // Other modes just return value
  test.deepEqual(renderMetaCell('nm_number', 4, 'filter'), 4);

  // Taxonomies return native language
  test.deepEqual(renderMetaCell('tx_sex', { id: 1, en: 'M', ge: 'მ' }, 'filter'), 'მ');
  test.deepEqual(renderMetaCell('tx_sex', { id: 2, en: 'F', ge: 'ფ' }, 'filter'), 'ფ');

  test.end();
});

test('renderMetaCell:display', function (test) {
  setupDom(test, '<html lang="en-GB" data-thousand-separator=":" data-decimal-separator="•"></html>');

  // HTML-encased & quoted
  test.deepEqual(renderMetaCell('ch_chchanges', '<hello>world</hello>', 'display'), '<code>&lt;hello&gt;world&lt;/hello&gt;</code>');

  // Use custom thousand & decimals, rounded to 2 dp.
  test.deepEqual(renderMetaCell('nm_n', 123456, 'display'), '<code>123:456•00</code>');
  test.deepEqual(renderMetaCell('nm_n', 1234567.4562, 'display'), '<code>1:234:567•46</code>');

  // Year/Month fields don't get numeric formatting
  test.deepEqual(renderMetaCell('nm_nYear', 1999, 'display'), '<code>1999</code>');
  test.deepEqual(renderMetaCell('nm_nMonth', 12, 'display'), '<code>12</code>');

  // Dates reformatted to the locale
  test.deepEqual(renderMetaCell('dt_dDate', '2023-11-22T16:38:28.817Z', 'display'), '<code>22/11/2023, 16:38</code>');

  test.end();
});

test('renderMetaCell:form', function (test) {
  const dom = setupDom(test, '<html lang="en-gb" data-thousand-separator=":" data-decimal-separator="•"></html>');
  dom.window.mApi = new MetadataApi('en-gb');
  dom.window.mApi._txHardcoded = {
    sex: [
      { id: 1, en: 'M.', is: 'Ka.' },
      { id: 2, en: 'F.', is: 'Kv.' }
    ]
  };

  // Wrapped in text field, escaped
  test.deepEqual(renderMetaCell('ch_chchanges', '<hello>"world"</hello>', 'form'), '<input type="text" class="form-control ph-meta" data-key="ch_chchanges" name="" value="<hello>&quot;world&quot;</hello>">');

  // Numbers get a number field
  test.deepEqual(renderMetaCell('nm_n', 1234567.4562, 'form'), '<input type="number" class="form-control ph-meta" data-key="nm_n" name="" value="1234567.4562">');

  // Dates get a date field, time ignored
  test.deepEqual(renderMetaCell('dt_dDate', '2023-11-22T16:38:28.817Z', 'form'), '<input type="date" class="form-control ph-meta" data-key="dt_dDate" name="" value="2023-11-22">');

  // Taxonomies get a dropdown
  test.deepEqual(renderMetaCell('tx_sex', { id: 1, en: 'M', ge: 'მ' }, 'form'), [
    '<select class="form-select ph-meta" data-key="tx_sex" name="">',
    '<option value="" >----</option>',
    '<option value="{&quot;id&quot;:1,&quot;en&quot;:&quot;M&quot;,&quot;ge&quot;:&quot;მ&quot;}" selected="">1: M</option>',
    '<option value="{&quot;id&quot;:2,&quot;en&quot;:&quot;F.&quot;,&quot;is&quot;:&quot;Kv.&quot;}">2: F.</option>',
    '</select>'
  ].join(''));

  test.end();
});
