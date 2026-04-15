import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const jsdom = require('jsdom');
const { JSDOM } = jsdom;
const jQueryFactory = require('jquery');

export function setupDom (test, html) {
  const dom = new JSDOM(html || '<!DOCTYPE html><html><body></body></html>', {
    url: 'http://localhost/'
  });

  test.teardown(() => {
    dom.window.close();
    global.window = undefined;
    global.document = undefined;
  });
  global.window = dom.window;
  global.document = dom.window.document;
  global.window.$ = jQueryFactory(window);

  return dom;
}
