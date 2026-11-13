import test from 'tape';

import { setupDom } from './util_dom.js';

import { WebcamFileSet } from '../src/fileset/webcam.js';
import { Cancelled } from '../src/errors.js';

test('WebcamFileSet:close whilst awaiting permission', function (test) {
  const dom = setupDom(test, '<!DOCTYPE html><html><body><div class="ph-viewer"><div class="canvas-container" style=""></div></div></body></html>');

  // getUserMedia resolves when we say, i.e. when the user grants permission
  let grant;
  const stopped = [];
  const stream = {
    getTracks: () => [{ stop: () => stopped.push('track') }],
    getVideoTracks: () => [{ label: 'Camera' }]
  };
  const origNavigator = Object.getOwnPropertyDescriptor(global, 'navigator');
  test.teardown(() => {
    if (origNavigator) Object.defineProperty(global, 'navigator', origNavigator); else delete global.navigator;
  });
  Object.defineProperty(global, 'navigator', {
    value: { mediaDevices: { getUserMedia: () => new Promise((resolve) => { grant = () => resolve(stream); }) } },
    configurable: true
  });

  const fs = new WebcamFileSet();
  const p = fs.next();
  return new Promise((resolve) => setTimeout(resolve, 0)).then(() => {
    // User switches to another source, then grants permission to the camera
    fs.close();
    grant();
    return p;
  }).then(() => test.fail('Should have been cancelled'), (err) => {
    test.ok(err instanceof Cancelled, 'Rejected with Cancelled');
    test.deepEqual(stopped, ['track'], 'Camera stream stopped');
    test.deepEqual(dom.window.document.querySelectorAll('video').length, 0, 'No video added to viewer');
  });
});
