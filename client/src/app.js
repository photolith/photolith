import { init as initIngestSelect } from './ingest_select';
import { init as initViewer } from './viewer';

window.addEventListener('DOMContentLoaded', (event) => {
  initIngestSelect(window);
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
