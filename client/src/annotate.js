import { fabric } from 'fabric';

import { changeEvent } from './events';
import { populateIndividualData } from './meta';

function formRefresh (event) {
  function pxToMM (px) {
    const mm = px * event.target.form.phPxMmRatio;
    return Math.round(mm * 100) / 100;
  }

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
      <td>${pxToMM(p.distanceFrom(pointData[i - 1]))}</td>
      <td>${pxToMM(totalDist += p.distanceFrom(pointData[i - 1]))}</td>
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
    document.querySelector('button#editor-tab').dispatchEvent(new window.MouseEvent('click', {
      view: window,
      bubbles: true,
      cancelable: true
    }));
  } else {
    const elTr = event.target.closest('tbody > tr');
    if (!elTr) return;

    // Select item (or deselect if already selected)
    Array.from(elTr.parentElement.children).forEach((el) => {
      if (el === elTr) {
        el.classList.toggle('table-info');
      } else {
        el.classList.remove('table-info');
      }
    });

    existingAnnotationsPopulate(
      elForm,
      document.querySelector('.ph-all-annotations>table>tbody'));
  }
}

function existingAnnotationsPopulate (elForm, tableEl) {
  let polys = [];

  if (tableEl) {
    const selectedEl = tableEl.querySelector('tr.table-info');

    if (selectedEl) {
      polys = selectedEl.querySelectorAll('script.axis_poly');
    } else {
      polys = tableEl.querySelectorAll('script.axis_poly');
    }
  }

  elForm.querySelector('.existing-annotation-polys').innerHTML = Array.from(polys).map((el, i) => {
    return `<input type="hidden" name="view_poly:${i}" value="${el.textContent}" />`;
  }).join('\n');
  elForm.dispatchEvent(new window.CustomEvent('element_addremove'));
}

export function init (parent) {
  parent.querySelectorAll('form.annotate-form').forEach((elForm) => {
    const indData = JSON.parse(document.getElementById('ind_data').textContent);

    // Ratio to convert annotation point distance into mm
    elForm.phPxMmRatio = indData.image__scale_mm / new fabric.Point(indData.image__scale_line[0][0], indData.image__scale_line[0][1]).distanceFrom(
      new fabric.Point(indData.image__scale_line[1][0], indData.image__scale_line[1][1])
    );

    elForm.addEventListener('change', formRefresh);

    document.querySelector('.ph-all-annotations').addEventListener('click', allAnnotationsClick.bind(document.querySelector('.ph-all-annotations'), elForm));

    populateIndividualData(indData);

    parent.querySelectorAll('button#existing-tab').forEach((elExistingBtn) => {
      if (elExistingBtn.classList.contains('active')) {
        // Selected by default, populate now
        elForm.elements.axis_poly.disabled = true;
        existingAnnotationsPopulate(
          elForm,
          document.querySelector('.ph-all-annotations>table>tbody'));
      }
      elExistingBtn.addEventListener('shown.bs.tab', function (event) {
        elForm.elements.axis_poly.disabled = true;
        existingAnnotationsPopulate(
          elForm,
          document.querySelector('.ph-all-annotations>table>tbody'));
      });
      elExistingBtn.addEventListener('hide.bs.tab', function (event) {
        elForm.elements.axis_poly.disabled = false;
        existingAnnotationsPopulate(
          elForm,
          null);
      });
    });
  });
}
