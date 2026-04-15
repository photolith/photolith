import test from 'tape';

import { setupDom } from './util_dom.js';

import { updateAnnotateUrl } from '../src/search.js';

test('updateAnnotateUrl', function (test) {
  setupDom(test);

  function doUpdate (html, search) {
    const containerEl = global.window.document.createElement('DIV');
    containerEl.innerHTML = html;
    global.window.history.replaceState(null, '', search);
    updateAnnotateUrl(containerEl);
    return containerEl.innerHTML;
  }

  test.deepEqual(
    doUpdate('<a href="/annotate/">parp</a><a href="/bannotate/">peep</a>', '?woo=yes'),
    '<a href="http://localhost/annotate/?woo=yes">parp</a><a href="/bannotate/">peep</a>',
    'Search string appended to URL, made absolute as side-effect, unknown URLs ignored'
  );

  test.deepEqual(
    doUpdate(doUpdate('<a href="/annotate/">parp</a><a href="/bannotate/">peep</a>', '?woo=yes'), '?woo=maybe'),
    '<a href="http://localhost/annotate/?woo=maybe">parp</a><a href="/bannotate/">peep</a>',
    'Repeated updates clear previous search, keep working'
  );

  test.end();
});
