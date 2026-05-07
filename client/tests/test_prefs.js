import test from 'tape';

import { setupDom } from './util_dom.js';

import { init } from '../src/prefs.js';
import { changeEvent } from '../src/events.js';

function dumpSessionStorage (window) {
  const s = window.sessionStorage;
  return Object.fromEntries(Object.keys(s).map(key => [key, s.getItem(key)]));
}

test('init', function (test) {
  setupDom(test, `<html lang="en"><body>
    <form>
      <input type="checkbox" id="pref-do-dance" class="pref pref-session">
      <input type="checkbox" id="pref-have-lunch" class="pref pref-session" checked>
    </form>
  </body></html>`);
  const elForm = global.window.document.getElementsByTagName('FORM')[0];
  const els = {
    'pref-do-dance': global.window.document.getElementById('pref-do-dance'),
    'pref-have-lunch': global.window.document.getElementById('pref-have-lunch')
  };
  init(global.window.document);

  test.deepEqual(dumpSessionStorage(global.window), {
    'pref-do-dance': 'off',
    'pref-have-lunch': 'on'
  }, 'Recorded default values in session storage');

  els['pref-do-dance'].checked = true;
  els['pref-do-dance'].dispatchEvent(changeEvent());
  test.deepEqual(dumpSessionStorage(global.window), {
    'pref-do-dance': 'on',
    'pref-have-lunch': 'on'
  }, 'Recorded new value on form change');

  elForm.reset();
  test.deepEqual(els['pref-do-dance'].checked, true, 'Still checked after reset');

  init(global.window.document);
  test.deepEqual(els['pref-do-dance'].checked, true, 'Still checked after re-init (i.e. page reload)');
  test.deepEqual(els['pref-have-lunch'].checked, true, 'Still checked after re-init (i.e. page reload)');

  test.end();
});

test('init select', function (test) {
  setupDom(test, `<html lang="en"><body>
    <form>
      <select id="pref-view-mode" class="pref pref-session" multiple>
        <option value="grid" selected>Grid</option>
        <option value="list">List</option>
        <option value="detail">Detail</option>
      </select>
    </form>
  </body></html>`);
  const elForm = global.window.document.getElementsByTagName('FORM')[0];
  const elSelect = global.window.document.getElementById('pref-view-mode');
  init(global.window.document);

  test.deepEqual(dumpSessionStorage(global.window), {}, 'No session storage entry before any change');

  elSelect.options[1].selected = true;
  elSelect.dispatchEvent(changeEvent());
  test.deepEqual(dumpSessionStorage(global.window), {
    'pref-view-mode': '["grid","list"]'
  }, 'Recorded selected options on change');

  elForm.reset();
  test.deepEqual(elSelect.options[1].selected, true, 'list still selected after form reset');
  test.deepEqual(elSelect.options[0].selected, true, 'grid still selected after form reset');

  init(global.window.document);
  test.deepEqual(elSelect.options[0].selected, true, 'grid still selected after re-init');
  test.deepEqual(elSelect.options[1].selected, true, 'list still selected after re-init');
  test.deepEqual(elSelect.options[2].selected, false, 'detail not selected after re-init');

  test.end();
});
