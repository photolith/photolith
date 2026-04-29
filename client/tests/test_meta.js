import test from 'tape';

import { setupDom } from './util_dom.js';

import { renderMetaCell, populateIndividualData, updateDataObject, renderSearchFilters } from '../src/meta.js';
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

  // Use custom thousand & decimals, rounded to 2 dp if floats
  test.deepEqual(renderMetaCell('nm_n', 123456, 'display'), '<code>123456</code>');
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
  test.deepEqual(renderMetaCell('nm_n', 1234567.4562, 'form'), '<input type="number" class="form-control ph-meta" data-key="nm_n" name="" value="1234567.4562" step="any">');

  // Integers get an integer field
  test.deepEqual(renderMetaCell('in_i', 1234567.8, 'form'), '<input type="number" class="form-control ph-meta" data-key="in_i" name="" value="1234567" step="1">');

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

test('populateIndividualData', function (test) {
  const dom = setupDom(test, '<html lang="en-gb" data-thousand-separator=":" data-decimal-separator="•"></html>');

  class UTMetadataApi extends MetadataApi {
    constructor (lang) {
      super(lang);
      this.intlExtend(this._metaLabels, {
        en: {
          ch_slideLabel: 'Slide Label',
          ch_individualLabel: 'Individual No.',
          tx_sampleType: 'Sample Type',
          nm_length: 'Length',
          nm_weight: 'Weight',
          dt_caught: 'Caught',
          in_fingers: 'Fingers',
          tx_sex: 'Sex'
        }
      });
      this._txHardcoded = {
        sex: [
          { id: 1, en: 'M.', is: 'Ka.' },
          { id: 2, en: 'F.', is: 'Kv.' }
        ]
      };
    }
  }
  dom.window.mApi = new UTMetadataApi('en-gb');

  function pid (indData, tableMode) {
    const elForm = dom.window.document.createElement('form');
    const includeNewHtml = `<tfoot><tr><td colspan="1"><select class="form-select add-new-metadata">
        <option value="" selected="selected">Add...</option>
    </select>
    </td><td><button type="button">Copy</button></td></tr></tfoot>`;

    elForm.innerHTML = `<table><tbody></tbody>${includeNewHtml}</table>`;

    populateIndividualData(indData, elForm.querySelector('tbody'), tableMode);
    return Array.from(elForm.querySelectorAll('tr')).map((elRow) => {
      return Array.from(elRow.querySelectorAll('td')).map((elCell) => {
        if (elCell.firstElementChild && elCell.firstElementChild.classList.contains('add-new-metadata')) {
          return Array.from(elCell.firstElementChild.options).map((o) => o.value);
        }
        return elCell.innerHTML.trim();
      });
    });
  }

  // No data
  test.deepEqual(pid({}, 'display'), [
    [['', 'ch_slideLabel', 'ch_individualLabel', 'tx_sampleType', 'nm_length', 'nm_weight', 'dt_caught', 'in_fingers', 'tx_sex'], '<button type="button">Copy</button>']
  ]);

  // No prefix --> ignored
  test.deepEqual(pid({ moo: 'no' }, 'display'), [
    [['', 'ch_slideLabel', 'ch_individualLabel', 'tx_sampleType', 'nm_length', 'nm_weight', 'dt_caught', 'in_fingers', 'tx_sex'], '<button type="button">Copy</button>']
  ]);

  // Character
  test.deepEqual(pid({ ch_slideLabel: 'moo' }, 'display'), [
    ['Slide Label', '<code>moo</code>'],
    [['', 'ch_individualLabel', 'tx_sampleType', 'nm_length', 'nm_weight', 'dt_caught', 'in_fingers', 'tx_sex'], '<button type="button">Copy</button>']
  ]);
  test.deepEqual(pid({ ch_slideLabel: 'moo' }, 'form'), [
    ['<label class="col-form-label">Slide Label</label>', '<input type="text" class="form-control ph-meta" data-key="ch_slideLabel" name="" value="moo">'],
    [['', 'ch_individualLabel', 'tx_sampleType', 'nm_length', 'nm_weight', 'dt_caught', 'in_fingers', 'tx_sex'], '<button type="button">Copy</button>']
  ]);

  // Numeric
  test.deepEqual(pid({ nm_length: 12345 }, 'display'), [
    ['Length', '<code>12345</code>'],
    [['', 'ch_slideLabel', 'ch_individualLabel', 'tx_sampleType', 'nm_weight', 'dt_caught', 'in_fingers', 'tx_sex'], '<button type="button">Copy</button>']
  ]);

  // Date
  test.deepEqual(pid({ dt_caught: '2001-03-01', nm_length: 1080 }, 'display'), [
    ['Length', '<code>1080</code>'],
    ['Caught', '<code>2001-03-01</code>'],
    [['', 'ch_slideLabel', 'ch_individualLabel', 'tx_sampleType', 'nm_weight', 'in_fingers', 'tx_sex'], '<button type="button">Copy</button>']
  ]);

  // Integer
  test.deepEqual(pid({ in_fingers: 5 }, 'display'), [
    ['Fingers', '<code>5</code>'],
    [['', 'ch_slideLabel', 'ch_individualLabel', 'tx_sampleType', 'nm_length', 'nm_weight', 'dt_caught', 'tx_sex'], '<button type="button">Copy</button>']
  ]);

  test.end();
});

test('updateDataObject', function (test) {
  const dom = setupDom(test, '<html lang="en-gb" data-thousand-separator=":" data-decimal-separator="•"></html>');
  dom.window.mApi = new MetadataApi('en-gb');
  dom.window.mApi._txHardcoded = {
    sex: [
      { id: 1, en: 'M.', is: 'Ka.' },
      { id: 2, en: 'F.', is: 'Kv.' }
    ]
  };

  function udo (inData, inKey, inVal) {
    const formEl = dom.window.document.createElement('form');
    formEl.innerHTML = renderMetaCell(inKey, inVal, 'form');

    return updateDataObject(inData, formEl.elements[0]);
  }

  // Value formatting preserved
  test.deepEqual(udo({}, 'nm_n', 12345.67), { nm_n: 12345.67 });
  test.deepEqual(udo({}, 'in_i', 12345.67), { in_i: 12345 });
  test.deepEqual(udo({}, 'ch_a', 'parp'), { ch_a: 'parp' });
  test.deepEqual(udo({}, 'dt_d', '2023-11-22T16:38:28.817Z'), { dt_d: '2023-11-22' }); // NB: Time truncated by renderDataCell()
  test.deepEqual(udo({}, 'tx_t', { id: 1, en: 'M', ge: 'მ' }), { tx_t: { id: 1, en: 'M', ge: 'მ' } });

  // Existing values kept unless overriden
  test.deepEqual(udo({ ch_a: 'hello', nm_n: 4 }, 'nm_n', 12345.67), { ch_a: 'hello', nm_n: 12345.67 });

  // Deleting tx values
  test.deepEqual(udo(
    { tx_t: { id: 1, en: 'M', ge: 'მ' } },
    'tx_t',
    ''
  ), {});

  test.end();
});

test('renderSearchFilter', function (test) {
  class UTMetadataApi extends MetadataApi {
    constructor (lang) {
      super(lang);
      this.intlExtend(this._metaLabels, {
        en: {
          ch_slideLabel: 'Slide Label',
          ch_individualLabel: 'Individual No.',
          tx_sampleType: 'Sample Type',
          nm_length: 'Length',
          nm_weight: 'Weight',
          dt_caught: 'Caught',
          in_fingers: 'Fingers',
          tx_sex: 'Sex'
        }
      });
      this._txHardcoded = {
        sex: [
          { id: 1, en: 'M.', is: 'Ka.' },
          { id: 2, en: 'F.', is: 'Kv.' }
        ]
      };
    }
  }

  const dom = setupDom(test, '<html lang="en-gb" data-thousand-separator=":" data-decimal-separator="•"></html>');
  dom.window.mApi = new UTMetadataApi('en-gb');

  function rsf (metaFields, search) {
    return renderSearchFilters(metaFields, new URLSearchParams(search || '')).split(/\s*\n+\s*/).filter((x) => !!x);
  }

  // Numeric
  test.deepEqual(rsf({ nm_length: { min: 50, max: 200 } }), [
    '<div class="mb-3">',
    '<label for="filter-nm_length-control" class="form-label">Length</label>',
    '<div class="input-group">',
    '<input type="number" name="nm_length" value="" min="50" max="200" class="form-control range-start" id="filter-nm_length-control">',
    '<span class="input-group-text">..</span>',
    '<input type="number" name="nm_length" value="" min="50" max="200" class="form-control range-end" id="filter-nm_length-control-2">',
    '</div>',
    '</div>'
  ]);

  // Character
  test.deepEqual(rsf({ ch_slideLabel: { char: true } }, 'ch_slideLabel=moo'), [
    '<div class="mb-3">',
    '<label for="filter-ch_slideLabel-control" class="form-label">Slide Label</label>',
    '<div class="input-group">',
    '<input type="text" name="ch_slideLabel" value="moo" class="form-control">',
    '<button type="button" class="btn btn-outline-secondary" title="Add extra search" onclick="el = event.target.previousElementSibling; el.after(el.cloneNode()) ; return false">+</button>',
    '</div>',
    '</div>'
  ]);

  // Integer
  test.deepEqual(rsf({ in_fingers: { min: 0, max: 5 } }), [
    '<div class="mb-3">',
    '<label for="filter-in_fingers-control" class="form-label">Fingers</label>',
    '<div class="input-group">',
    '<input type="number" name="in_fingers" value="" min="0" max="5" class="form-control range-start" id="filter-in_fingers-control" step="1">',
    '<span class="input-group-text">..</span>',
    '<input type="number" name="in_fingers" value="" min="0" max="5" class="form-control range-end" id="filter-in_fingers-control-2" step="1">',
    '</div>',
    '</div>'
  ]);

  test.end();
});
