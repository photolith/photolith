import { createRequire } from 'module';
import DataTable from 'datatables.net-bs5';
const require = createRequire(import.meta.url);

const jsdom = require('jsdom');
const { JSDOM } = jsdom;

export function setupDom (test, html) {
  const dom = new JSDOM(html || '<!DOCTYPE html><html><body></body></html>', {
    url: 'http://localhost/'
  });

  test.teardown(() => {
    dom.window.close();
    global.window = undefined;
    global.document = undefined;
  });
  // NB: Attach a DT now to ensure it require()s in headless mode: https://github.com/DataTables/DataTablesSrc/issues/385
  DataTable(dom.window);
  global.window = dom.window;
  global.document = dom.window.document;

  return dom;
}
