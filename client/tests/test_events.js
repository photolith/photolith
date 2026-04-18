import test from 'tape';

import { setupDom } from './util_dom.js';

import { changeEvent, toggleUnloadWarning, formUnloadWarning } from '../src/events.js';

/** Try unloading, return true iff something stopped us */
function attemptUnload (window) {
  const event = new window.Event('beforeunload', { cancelable: true });
  window.window.dispatchEvent(event);

  return event.defaultPrevented;
}

test('toggleUnloadWarning', function (test) {
  setupDom(test, `<html lang="en"><body>
  </body></html>`);

  test.deepEqual(attemptUnload(global.window), false, 'Not stopped unloading by default');
  toggleUnloadWarning(true);
  test.deepEqual(attemptUnload(global.window), true, 'Unload warning on, got stopped');
  toggleUnloadWarning(false);
  test.deepEqual(attemptUnload(global.window), false, 'Unload warning off, continued');
  toggleUnloadWarning(true);
  test.deepEqual(attemptUnload(global.window), true, 'Unload warning on, got stopped');
  toggleUnloadWarning(true);
  test.deepEqual(attemptUnload(global.window), true, 'Unload warning on, got stopped');

  test.end();
});

test('formUnloadWarning', function (test) {
  setupDom(test, `<html lang="en"><body>
    <form>
      <input type="text" name="cow" value="bessie">
      <input type="text" name="selection" value="pig">
      <input type="checkbox" name="do_dance" class="pref" checked>
    </form>
  </body></html>`);
  const elForm = global.window.document.forms[0];
  formUnloadWarning(elForm);

  test.deepEqual(attemptUnload(global.window), false, 'Not stopped unloading by default');

  elForm.elements.cow.value = 'freda';
  elForm.elements.cow.dispatchEvent(changeEvent());
  test.deepEqual(attemptUnload(global.window), true, 'Modified field, got stopped');

  elForm.reset();
  test.deepEqual(attemptUnload(global.window), false, 'Reset form, state cleared');

  elForm.elements.selection.value = 'freda';
  elForm.elements.selection.dispatchEvent(changeEvent());
  test.deepEqual(attemptUnload(global.window), false, 'Changing selection field does nothing');

  elForm.elements.do_dance.checked = false;
  elForm.elements.do_dance.dispatchEvent(changeEvent());
  test.deepEqual(attemptUnload(global.window), false, 'Preference fields also ignored');

  elForm.elements.cow.value = 'geraldine';
  elForm.elements.cow.dispatchEvent(changeEvent());
  test.deepEqual(attemptUnload(global.window), true, 'Modified field, got stopped');

  // NB: Not testing submit clearing, since JSDOM doesn't seem to support it.

  test.end();
});
