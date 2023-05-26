import { init as initIngestSelect } from './ingest_select';
import { init as initViewer } from './viewer';

window.addEventListener('DOMContentLoaded', (event) => {
  initIngestSelect(window);
  initViewer(window);
});
