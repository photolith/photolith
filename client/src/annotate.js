import { fabric } from 'fabric';

import { displayAlert } from './alert';
import { changeEvent } from './events';
import { jsonFetch } from './fetch';
import { populateIndividualData } from './meta';

const existingPallete = [
  '230, 159, 0',
  '0, 158, 115',
  '240, 228, 66',
  '0, 144, 178',
  '213, 94, 0',
  '204, 121, 167'
];

function formRefresh (pxMmRatio, event) {
  function pxToMM (px) {
    const mm = px * pxMmRatio;
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
    formRefresh(pxMmRatio, { target: event.target.form.axis_poly });
  }
}

function allAnnotationsClick (elForm, event) {
  if (event.target.tagName === 'BUTTON') {
    const elSelected = this.querySelector('tbody > tr.table-info');
    let axisPoly = elSelected ? JSON.parse(elSelected.querySelector(':scope .ph-line-legend').getAttribute('data-axis-poly')) : undefined;

    if (!axisPoly) {
      displayAlert('warning', this.getAttribute('data-locale-select-annotation-first'), 2000);
      return;
    }

    if (event.target.classList.contains('ph-delete')) {
      return jsonFetch(`/annotate/delete/${elSelected.getAttribute('data-annotation-id')}/`, {
        method: 'POST'
      }).then((data) => {
        elSelected.remove();
        existingAnnotationsPopulate(
          elForm,
          this.querySelector('tbody'));
        displayAlert('success', data.message);
      });
    }

    if (event.target.classList.contains('ph-copy-line')) {
      // Strip out everything in the middle
      axisPoly = [axisPoly[0], axisPoly[axisPoly.length - 1]];
    } else if (event.target.classList.contains('ph-copy-full')) {
      // Copy other metadata to form, leave axis poly intact
      // NB: Wait until after the change event has auto-updated the age
      window.setTimeout((newVal) => {
        elForm.elements.age.value = newVal;
      }, 100, elSelected.querySelector('.val-age').textContent);
      elForm.elements.rating.value = elSelected.querySelector('.val-rating').getAttribute('data-value');
      elForm.elements.authority.value = elSelected.querySelector('.val-authority').getAttribute('data-value');
      if (elForm.elements.authority.selectedIndex === -1) {
        // Doesn't already exist, so create a new option with this authority level
        elForm.elements.authority.add(new window.Option(
          elSelected.querySelector('.val-authority').getAttribute('data-value')));
        elForm.elements.authority.selectedIndex = elForm.elements.authority.options.length - 1;
      }
      elForm.elements.comment.value = elSelected.querySelector('.val-comment').textContent;
    } else {
      throw new Error('Unknown button ' + event.target.className);
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

    // Grey all legends, so unused legends stay greyed out
    tableEl.querySelectorAll('.ph-line-legend').forEach((el) => {
      el.style.borderColor = '#ccc';
    });

    if (selectedEl) {
      polys = selectedEl.querySelectorAll('.ph-line-legend');
    } else {
      polys = tableEl.querySelectorAll('.ph-line-legend');
    }

    document.querySelector('.ph-all-annotations > button.ph-delete').classList.toggle('d-none', !(
      selectedEl && selectedEl.classList.contains('my-annotation')
    ));
  }

  elForm.querySelector('.existing-annotation-polys').innerHTML = Array.from(polys).map((el, i) => {
    const col = existingPallete[i % existingPallete.length];

    el.style.borderColor = `rgb(${col})`;
    return `<input type="hidden" name="view_poly:${i}" data-stroke="${col}" value="${el.getAttribute('data-axis-poly')}" />`;
  }).join('\n');
  elForm.dispatchEvent(new window.CustomEvent('element_addremove'));
}

export function init (parent) {
  parent.querySelectorAll('form.annotate-form').forEach((elForm) => {
    const indData = JSON.parse(document.getElementById('ind_data').textContent);

    elForm.addEventListener('change', formRefresh.bind(elForm, parseFloat(elForm.getAttribute('data-px-mm'))));

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
