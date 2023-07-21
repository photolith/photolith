import { PhViewer } from './viewer/base';
import { PhAnnotate } from './viewer/annotate';
import { PhCropper } from './viewer/ingest';

export function init (parent) {
  parent.querySelectorAll('div.ph-viewer').forEach((elViewer) => {
    const v = elViewer.classList.contains('ph-annotate') ? new PhAnnotate(elViewer) : elViewer.classList.contains('ph-cropper') ? new PhCropper(elViewer) : new PhViewer(elViewer);

    if (elViewer.hasAttribute('data-sync-form')) {
      v.setSyncForm(document.querySelector(elViewer.getAttribute('data-sync-form')));
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
