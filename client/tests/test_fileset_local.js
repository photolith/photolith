import test from 'tape';

import { setupDom } from './util_dom.js';

import { LocalFileSet } from '../src/fileset/local.js';
import { Cancelled } from '../src/errors.js';

test('LocalFileSet:next', function (test) {
  const dom = setupDom(test);
  const fs = new LocalFileSet();
  const choose = (files) => {
    Object.defineProperty(fs.input, 'files', { value: files, configurable: true });
    fs.input.dispatchEvent(new dom.window.Event('change'));
  };

  // Dismissing dialog rejects with Cancelled, rather than never settling
  const p1 = fs.next();
  fs.input.dispatchEvent(new dom.window.Event('cancel'));
  return p1.then(() => test.fail('Should have been cancelled'), (err) => {
    test.ok(err instanceof Cancelled, 'Cancelling dialog rejects with Cancelled');

    const p2 = fs.next();
    choose(['a.jpg', 'b.jpg']);
    return p2;
  }).then((f) => {
    test.deepEqual(f, 'a.jpg', 'First file chosen returned');
    test.deepEqual(fs.remaining(), 1, 'One remaining');
    return fs.next();
  }).then((f) => {
    test.deepEqual(f, 'b.jpg', 'Second file returned without dialog');

    // Out of files, next() reopens dialog, choosing nothing is cancelled too
    const p3 = fs.next();
    choose([]);
    return p3.then(() => test.fail('Should have been cancelled'), (err) => {
      test.ok(err instanceof Cancelled, 'Choosing nothing rejects with Cancelled');
    });
  });
});
