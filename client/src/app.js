import { init as initIngestSelect } from './ingest_select';
import { init as initIngestForm } from './ingest_form';
import { init as initViewer } from './viewer';

import DummyMetadataApi from './metadata_api/dummy';
import HafroMetadataApi from './metadata_api/hafro';
window.DummyMetadataApi = DummyMetadataApi;
window.HafroMetadataApi = HafroMetadataApi;

window.addEventListener('DOMContentLoaded', (event) => {
  initIngestSelect(window);
  initIngestForm(window);
  initViewer(window);
});

function displayAlert (level, messageHTML) {
  const elAlert = document.createElement('DIV');

  elAlert.className = `alert alert-${level} alert-dismissible fade show`;
  elAlert.setAttribute('role', 'alert');
  elAlert.innerHTML = [
    messageHTML,
    '<button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>'
  ].join('\n');
  document.getElementById('alert-container').append(elAlert);

  window.setTimeout(() => {
    if (elAlert.isConnected) new window.bootstrap.Alert(elAlert).close();
  }, 5000);
}

window.addEventListener('unhandledrejection', (event) => {
  displayAlert('danger', event.reason);
});

window.onerror = (event, source, lineno, colno, error) => {
  displayAlert('danger', error);
};
