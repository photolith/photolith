import { PhViewer } from './viewer/base';
import { PhAnnotate } from './viewer/annotate';
import { PhCropper } from './viewer/ingest';

export function init (parent) {
  parent.querySelectorAll('div.ph-viewer').forEach((elViewer) => {
    const v = elViewer.classList.contains('ph-annotate') ? new PhAnnotate(elViewer) : elViewer.classList.contains('ph-cropper') ? new PhCropper(elViewer) : new PhViewer(elViewer);

    if (elViewer.hasAttribute('data-sync-form')) {
      v.elSyncForm = document.querySelector(elViewer.getAttribute('data-sync-form'));
      v.elSyncForm.addEventListener('load_individuals', (event) => {
        v.loadIndividuals();
      });
      v.elSyncForm.addEventListener('change', (event) => {
        if (event.detail === 999) return; // Break loops
        if (event.target.name === 'image_file') {
          if (!event.target.phBlob) {
            // No blob, so start of load
            v.startRendering();
          } else {
            v.load(event.target.phBlob);
          }
          return;
        }

        v.reverseSyncForm({ target: v.fabCanvas.getObjects().find((obj) => obj.id === event.target.name) });
      });
    }

    if (elViewer.hasAttribute('data-src')) {
      v.startRendering();
      window.fetch(elViewer.getAttribute('data-src')).then((resp) => {
        if (!resp.ok) throw new Error(resp.statusText);
        return resp.blob();
      }).then((blob) => {
        v.load(blob, JSON.parse(elViewer.getAttribute('data-bounding-box') || 'null'));
      });
    }
    return v;
  });
}
