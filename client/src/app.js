import { displayAlert } from './alert';
import { init as initIngestSelect } from './ingest_select';
import { init as initIngestForm } from './ingest_form';
import { init as initSearch } from './search';
import { init as initViewer } from './viewer';

import DummyMetadataApi from './metadata_api/dummy';
import HafroMetadataApi from './metadata_api/hafro';
window.DummyMetadataApi = DummyMetadataApi;
window.HafroMetadataApi = HafroMetadataApi;

window.addEventListener('DOMContentLoaded', (event) => {
  initIngestSelect(window);
  initIngestForm(window);
  initSearch(window);
  initViewer(window);
});

window.addEventListener('unhandledrejection', (event) => {
  displayAlert('danger', event.reason);
});

window.onerror = (event, source, lineno, colno, error) => {
  displayAlert('danger', error);
};
