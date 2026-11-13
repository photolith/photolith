import test from 'tape';

import { setupDom } from './util_dom.js';

import { PhFilteringViewer } from '../src/viewer/filtering.js';

test('PhFilteringViewer:refreshFilters', function (test) {
  const dom = setupDom(test, '<!DOCTYPE html><html><body><form><input type="range" name="brightness" value="0"></form></body></html>');
  // NB: refreshFilters() uses the global FormData, use JSDOM's so it understands JSDOM forms
  const origFormData = global.FormData;
  test.teardown(() => { global.FormData = origFormData; });
  global.FormData = dom.window.FormData;

  // NB: JSDOM can't create a fabric canvas, so stub out just what refreshFilters() uses
  const v = Object.create(PhFilteringViewer.prototype);
  v.elForm = dom.window.document.querySelector('form');
  v.phFiltersApplied = true; // i.e. not the first time, so filters are applied immediately
  v.fabCanvas = { renderAll () {} };
  const applied = [];
  const mkImg = (name) => ({ applyFilters () { applied.push(`${name}:${this.filters.length}`); } });

  v.fabCanvas.backgroundImage = mkImg('A');
  v.elForm.elements.brightness.value = '0.5';
  v.refreshFilters();
  test.deepEqual(applied, ['A:1'], 'Filters applied');

  v.refreshFilters();
  test.deepEqual(applied, ['A:1'], 'Filters not reapplied when nothing changed');

  v.elForm.elements.brightness.value = '0.25';
  v.refreshFilters();
  test.deepEqual(applied, ['A:1', 'A:1'], 'Reapplied when filters change');

  v.fabCanvas.backgroundImage = mkImg('B');
  v.refreshFilters();
  test.deepEqual(applied, ['A:1', 'A:1', 'B:1'], 'Applied to newly loaded image, even though filters are the same');

  test.end();
});
