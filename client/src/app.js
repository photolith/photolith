import { displayAlert } from './alert';
import { init as initIngestSelect } from './ingest_select';
import { init as initIngestForm } from './ingest_form';
import { init as initSearch } from './search';
import { init as initAnnotate } from './annotate';
import { init as initViewer } from './viewer';
import { init as initCroppedViewer } from './cropped_viewer';

import DummyMetadataApi from './metadata_api/dummy';
import HafroMetadataApi from './metadata_api/hafro';
window.DummyMetadataApi = DummyMetadataApi;
window.HafroMetadataApi = HafroMetadataApi;

// Expose for admin interface to use
window.initCroppedViewer = initCroppedViewer;

window.addEventListener('DOMContentLoaded', (event) => {
  initIngestSelect(window);
  initIngestForm(window);
  initSearch(window);
  initAnnotate(window);
  initViewer(window);
});

window.addEventListener('unhandledrejection', (event) => {
  displayAlert('danger', event.reason);
});

window.onerror = (event, source, lineno, colno, error) => {
  displayAlert('danger', error);
};
