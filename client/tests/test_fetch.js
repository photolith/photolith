import test from 'tape';

import { setupDom } from './util_dom.js';

import { blobFetch, htmlFetch, jsonFetch } from '../src/fetch.js';

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
  }).then(() => {
    // e.g. Django CSRF failure page, NB: no statusText over HTTP/2
    nextResponse = new Response('<!DOCTYPE html>\n<html lang="en">\n<h1>Forbidden</h1>', { status: 403 });
    return jsonFetch('/ut/').then(() => test.fail('Should have thrown'), (err) => {
      test.deepEqual(err.message, 'Failed to fetch /ut/: 403 (<!DOCTYPE html> <htm...)', 'Non-JSON error response includes status & start of body');
    });
  }).then(() => {
    nextResponse = new Response('', { status: 502, statusText: 'Bad Gateway' });
    return jsonFetch('/ut/').then(() => test.fail('Should have thrown'), (err) => {
      test.deepEqual(err.message, 'Failed to fetch /ut/: 502 Bad Gateway', 'Empty error response includes status');
    });
  }).then(() => {
    nextResponse = new Response('{"a": 1}', { status: 404 });
    return jsonFetch('/ut/').then(() => test.fail('Should have thrown'), (err) => {
      test.deepEqual(err.message, 'Failed to fetch /ut/: 404', 'JSON error response without an error reports status');
    });
  });
});

test('fetch:network errors', function (test) {
  const dom = setupDom(test);
  let nextError;
  dom.window.fetch = () => Promise.reject(nextError);
  const origConsoleError = console.error;
  console.error = () => {};
  test.teardown(() => { console.error = origConsoleError; });

  // e.g. blocked request, offline
  nextError = new TypeError('Failed to fetch');
  return Promise.all([jsonFetch, htmlFetch, blobFetch].map((fn) => fn('/media/ut.jpg').then(() => test.fail('Should have thrown'), (err) => {
    test.deepEqual(err.message, 'Failed to fetch /media/ut.jpg: Network error, could not reach server (Failed to fetch)', `${fn.name}: URL included in network errors`);
    test.equal(err.cause, nextError, `${fn.name}: Original error available as cause`);
  }))).then(() => {
    // Aborts passed on untouched, so callers can recognise them
    nextError = new dom.window.DOMException('The user aborted a request.', 'AbortError');
    return blobFetch('/media/ut.jpg').then(() => test.fail('Should have thrown'), (err) => {
      test.equal(err, nextError, 'AbortError passed on as-is');
    });
  });
});

test('fetch:HTTP errors', function (test) {
  const dom = setupDom(test);
  let nextResponse;
  dom.window.fetch = () => Promise.resolve(nextResponse);

  // NB: HTTP/2 responses have no statusText
  nextResponse = new Response('', { status: 404 });
  return blobFetch('/media/ut.jpg').then(() => test.fail('Should have thrown'), (err) => {
    test.deepEqual(err.message, 'Failed to fetch /media/ut.jpg: 404', 'Status code included, even without statusText');
  }).then(() => {
    nextResponse = new Response('', { status: 500, statusText: 'Internal Server Error' });
    return htmlFetch('/ut/').then(() => test.fail('Should have thrown'), (err) => {
      test.deepEqual(err.message, 'Failed to fetch /ut/: 500 Internal Server Error', 'statusText included when available');
    });
  });
});

test('jsonFetch:csrf', function (test) {
  const dom = setupDom(test);
  let lastOptions;
  dom.window.fetch = (resource, options) => {
    lastOptions = options;
    return Promise.resolve(new Response('{}', { status: 200 }));
  };

  return jsonFetch('/ut/').then(() => {
    test.equal(lastOptions.headers['X-CSRFToken'], undefined, 'No token sent for GET');

    return jsonFetch('/ut/', { method: 'POST' });
  }).then(() => {
    test.equal(lastOptions.headers['X-CSRFToken'], null, 'No cookie, no token');

    dom.window.document.cookie = 'csrftoken=aaaa';
    return jsonFetch('/ut/', { method: 'POST', headers: { 'X-Other': 'x' } });
  }).then(() => {
    test.deepEqual(lastOptions.headers, { 'X-Other': 'x', Accept: 'application/json', 'X-CSRFToken': 'aaaa' }, 'Token read from cookie, other headers kept');

    // e.g. login in another tab rotated the token
    dom.window.document.cookie = 'xcsrftoken=nope';
    dom.window.document.cookie = 'csrftoken=bbbb';
    dom.window.document.cookie = 'sessionid=cccc';
    return jsonFetch('/ut/', { method: 'delete' });
  }).then(() => {
    test.equal(lastOptions.headers['X-CSRFToken'], 'bbbb', 'Current token read, other cookies ignored');
  });
});
