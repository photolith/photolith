import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const jsdom = require('jsdom');
const { JSDOM } = jsdom;

export function setupDom (test, html) {
  const dom = new JSDOM(html);

  test.teardown(() => {
    dom.window.close();
    global.window = undefined;
    global.document = undefined;
  });
  global.window = dom.window;
  global.document = dom.window.document;

  return dom;
}
