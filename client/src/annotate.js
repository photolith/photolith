import { fabric } from 'fabric';

import { changeEvent } from './events';
import { populateIndividualData } from './meta';

function formRefresh (event) {
  if (event.target.name === 'axis_poly') {
    const elTableBody = window.document.querySelector('#axis_poly_table tbody');
    const pointData = JSON.parse(event.target.value || '[]').map((p) => new fabric.Point(p[0], p[1]));
    let totalDist = 0;

    // Find currently selected point
    let selectedIdx = event.target.form.selection.value.match(/^axis_poly\[(\d+)\]$/);
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
    formRefresh({ target: event.target.form.axis_poly });
  }
}

function allAnnotationsClick (elForm, event) {
  if (event.target.tagName === 'BUTTON') {
    const elScript = this.querySelector('tbody > tr.table-info script.axis_poly');
    let axisPoly = elScript ? JSON.parse(elScript.textContent) : undefined;
    if (!axisPoly) return;

    if (event.target.classList.contains('ph-copy-line')) {
      // Strip out everything in the middle
      axisPoly = [axisPoly[0], axisPoly[axisPoly.length - 1]];
    }

    elForm.axis_poly.value = JSON.stringify(axisPoly);
    elForm.axis_poly.dispatchEvent(changeEvent());
  } else {
    const elTr = event.target.closest('tbody > tr');
    if (!elTr) return;

    Array.from(elTr.parentElement.children).forEach((el) => {
      el.classList.remove('table-info');
    });
    elTr.classList.add('table-info');
  }
}

export function init (parent) {
  parent.querySelectorAll('form.annotate-form').forEach((elForm) => {
    const indData = JSON.parse(document.getElementById('ind_data').textContent);

    // Ratio to convert annotation point distance into mm
    indData.px_to_mm = indData.image__scale_mm / new fabric.Point(indData.image__scale_line[0][0], indData.image__scale_line[0][1]).distanceFrom(
      new fabric.Point(indData.image__scale_line[1][0], indData.image__scale_line[1][1])
    );

    elForm.addEventListener('change', formRefresh);

    document.querySelector('.ph-all-annotations').addEventListener('click', allAnnotationsClick.bind(document.querySelector('.ph-all-annotations'), elForm));

    populateIndividualData(indData);
  });
}
