import { fabric } from 'fabric';

import { populateIndividualData } from './meta';
import { changeEvent } from './events';

function formRefresh (event) {
  if (event.target.name === 'bisect_poly') {
    const elTableBody = window.document.querySelector('#bisect_poly_table tbody');
    const pointData = JSON.parse(event.target.value || '[]').map((p) => new fabric.Point(p[0], p[1]));
    let totalDist = 0;

    // Find currently selected point
    let selectedIdx = event.target.form.selection.value.match(/^bisect_poly\[(\d+)\]$/);
    selectedIdx = selectedIdx ? parseInt(selectedIdx[1], 10) : null;

    elTableBody.innerHTML = pointData.map((p, i) => i === 0
      ? ''
      : `<tr class="${i === selectedIdx ? 'table-info' : ''}">
      <td>${i === pointData.length - 1 ? 'E' : i}</td>
      <td>${Math.round(p.distanceFrom(pointData[i - 1]))}</td>
      <td>${Math.round(totalDist += p.distanceFrom(pointData[i - 1]))}</td>
    </tr>`).join('\n');

    // Count ring markers and use that as age value
    event.target.form.age.value = pointData.length - 2;
  }

  if (event.target.name === 'selection') {
    // Refresh the form
    formRefresh({ target: event.target.form.bisect_poly });
  }
}

export function init (window) {
  window.document.querySelectorAll('form.annotate-form').forEach((elForm) => {
    const indData = JSON.parse(document.getElementById('individual_json').textContent);

    // Ratio to convert annotation point distance into mm
    indData.px_to_mm = indData.scale_mm / new fabric.Point(indData.scale_line[0][0], indData.scale_line[0][1]).distanceFrom(
      new fabric.Point(indData.scale_line[1][0], indData.scale_line[1][1])
    );

    elForm.addEventListener('change', formRefresh);

    populateIndividualData(indData.data);
    return window.fetch(indData.href).then((resp) => {
      if (!resp.ok) throw new Error(resp);
      return resp.blob();
    }).then((blob) => {
      elForm.dispatchEvent(new window.CustomEvent('load_file', {
        detail: {
          file: blob,
          bounding_box: indData.bounding_box
        }
      }));
      elForm.bisect_poly.value = JSON.stringify([
        [(indData.bounding_box[0][0] + indData.bounding_box[1][0]) / 2, (indData.bounding_box[0][1] + indData.bounding_box[1][1]) / 2],
        [indData.bounding_box[0][0] + 5, indData.bounding_box[0][1] + 5]
      ]);
      elForm.bisect_poly.dispatchEvent(changeEvent());
    });
  });
}
