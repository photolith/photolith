import { displayAlert } from './alert';
import { init as initIngestSelectBar } from './ingest_selectbar';
import { init as initIngestForm } from './ingest_form';
import { init as initSearch } from './search';
import { init as initAnnotate } from './annotate';
import { init as initAnnotateSelectBar } from './annotate_selectbar';
import { init as initProjectForm } from './project_form';
import { init as initViewer } from './viewer';
import { init as initCroppedViewer } from './cropped_viewer';

import DummyMetadataApi from './metadata_api/dummy';
import HafroMetadataApi from './metadata_api/hafro';
window.DummyMetadataApi = DummyMetadataApi;
window.HafroMetadataApi = HafroMetadataApi;

// Expose for admin interface to use
window.initCroppedViewer = initCroppedViewer;

window.addEventListener('DOMContentLoaded', (event) => {
  initIngestSelectBar(window.document);
  initIngestForm(window.document);
  initSearch(window.document);
  initAnnotate(window.document);
  initAnnotateSelectBar(window.document);
  initProjectForm(window.document);
  initViewer(window.document);
});

window.addEventListener('unhandledrejection', (event) => {
  displayAlert('danger', event.reason);
});

window.onerror = (event, source, lineno, colno, error) => {
  displayAlert('danger', error);
};
