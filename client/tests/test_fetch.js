import test from 'tape';

import { setupDom } from './util_dom.js';

import { jsonFetch } from '../src/fetch.js';

test('jsonFetch', function (test) {
  const dom = setupDom(test);
  let nextResponse;
  dom.window.fetch = () => Promise.resolve(nextResponse);

  nextResponse = new Response('{"a": 1}', { status: 200 });
  return jsonFetch('/ut/').then((rv) => {
    test.deepEqual(rv, { a: 1 }, 'Successful response returned');

    // e.g. response_json streaming response, that failed part-way through
    nextResponse = new Response('{"error_class": "ValueError", "error": "Bad thing"}', { status: 200 });
    return jsonFetch('/ut/').then(() => test.fail('Should have thrown'), (err) => {
      test.deepEqual(err.message, 'Failed to fetch /ut/ [ValueError]: Bad thing', 'Error reported in a 200 response is passed on');
    });
  }).then(() => {
    nextResponse = new Response('<html>not json</html>', { status: 200 });
    return jsonFetch('/ut/').then(() => test.fail('Should have thrown'), (err) => {
      test.deepEqual(err.message, 'Failed to fetch /ut/: Unparsable (<html>not json</html...)', 'Unparsable response includes start of body');
    });
  }).then(() => {
    nextResponse = new Response('\n  {"a":\n', { status: 200 });
    return jsonFetch('/ut/').then(() => test.fail('Should have thrown'), (err) => {
      test.deepEqual(err.message, 'Failed to fetch /ut/: Unparsable ({"a":)', 'Short bodies shown whole, whitespace collapsed');
    });
  }).then(() => {
    nextResponse = new Response('{"error_class": "PermissionDenied", "error": "No"}', { status: 500 });
    return jsonFetch('/ut/').then(() => test.fail('Should have thrown'), (err) => {
      test.deepEqual(err.message, 'Failed to fetch /ut/ [PermissionDenied]: No', 'Error response passed on');
    });
  });
});
