import { Point } from 'fabric';

import { displayAlert } from './alert';
import { changeEvent, formUnloadWarning } from './events';
import { setDefaultValue } from './utils';
import { jsonFetch } from './fetch';
import { attribEscape, htmlEscape, populateIndividualData } from './meta';
import { getLifecycle } from './lifecycle';

const existingPallete = [
  '230, 159, 0',
  '0, 158, 115',
  '240, 228, 66',
  '0, 144, 178',
  '213, 94, 0',
  '204, 121, 167'
];

function formRefresh (pxMmRatio, lifecycle, indData, event) {
  function pxToMM (px) {
    const mm = px * pxMmRatio;
    return Math.round(mm * 100) / 100;
  }

  if (event.target.name === 'axis_poly') {
    const elTableBody = window.document.querySelector('#axis_poly_table tbody');
    const rawPoints = JSON.parse(event.target.value || '[]');
    const pointData = rawPoints.map((p) => new Point(p[0], p[1]));
    let totalDist = 0;

    // Replace any labels that aren't possible with the first option, one at a time as each affects the next
    let labelOptions;
    let labelsChanged = false;
    while (true) {
      labelOptions = lifecycle.labelOptions(rawPoints);
      const i = rawPoints.findIndex((p, i) => !labelOptions[i].includes(p.length > 2 ? p[2] : null));
      if (i < 0) break;

      rawPoints[i] = rawPoints[i].slice(0, 2);
      if (labelOptions[i][0] !== null) rawPoints[i].push(labelOptions[i][0]);
      labelsChanged = true;
    }
    if (labelsChanged) {
      if (event.formReset) {
        // Form was just reset, update the default & reset again so we don't trigger onbeforeunload
        setDefaultValue(event.target, JSON.stringify(rawPoints));
        event.target.form.reset();
      } else {
        // Labels changed, update axis_poly & let the change event update viewer / table
        event.target.value = JSON.stringify(rawPoints);
        event.target.dispatchEvent(changeEvent());
      }
      return;
    }

    // Select box of possible labels for point (i)
    function pointLabelSelect (i) {
      return `<select class="form-select form-select-sm ph-point-label" data-idx="${i}">${labelOptions[i].filter((l) => l !== null).map((l) =>
        `<option value="${attribEscape(l)}"${l === rawPoints[i][2] ? ' selected' : ''}>${htmlEscape(l)}</option>`
      ).join('')}</select>`;
    }

    // Find currently selected point
    let selectedIdx = event.target.form.selection.value.match(/^axis_poly\[(\d+)\]$/);
    selectedIdx = selectedIdx ? parseInt(selectedIdx[1], 10) : null;

    // Back-calculated lengths, only show the column if there are any
    const backCalc = lifecycle.backCalc(rawPoints, indData);
    window.document.querySelector('#axis_poly_table thead .ph-back-calc').classList.toggle('d-none', !backCalc);

    elTableBody.innerHTML = pointData.map((p, i) => i === 0
      ? ''
      : `<tr class="${i === selectedIdx ? 'table-info' : ''}" data-idx="${i}">
      <td>${pointLabelSelect(i)}</td>
      <td>${pxToMM(p.distanceFrom(pointData[i - 1]))}</td>
      <td>${pxToMM(totalDist += p.distanceFrom(pointData[i - 1]))}</td>
      ${backCalc ? `<td>${backCalc[i] === null ? '' : Math.round(backCalc[i] * 100) / 100}</td>` : ''}
    </tr>`).join('\n');

    event.target.form.age.value = lifecycle.age(rawPoints);
  }

  if (event.target.classList.contains('ph-point-label')) {
    // Write new label back into axis_poly, and let the viewer / table update from that
    const elAxisPoly = event.target.form.axis_poly;
    const rawPoints = JSON.parse(elAxisPoly.value || '[]');
    const i = parseInt(event.target.getAttribute('data-idx'), 10);

    rawPoints[i] = rawPoints[i].slice(0, 2);
    if (event.target.value) rawPoints[i].push(event.target.value);
    elAxisPoly.value = JSON.stringify(rawPoints);
    elAxisPoly.dispatchEvent(changeEvent());
  }

  if (event.target.name === 'selection') {
    // Refresh the form
    formRefresh(pxMmRatio, lifecycle, indData, { target: event.target.form.axis_poly });
  }
}

function allAnnotationsClick (elForm, event) {
  if (event.target.tagName === 'BUTTON') {
    const elSelected = this.querySelector('tbody > tr.table-info');
    const axisPoly = elSelected ? JSON.parse(elSelected.querySelector(':scope .ph-line-legend').getAttribute('data-axis-poly')) : undefined;

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
      // Clear any previous age/comment
      setDefaultValue(elForm.elements.age, 0);
      setDefaultValue(elForm.elements.comment, '');

      // Strip out everything in the middle
      setDefaultValue(elForm.elements.axis_poly, JSON.stringify([axisPoly[0], axisPoly[axisPoly.length - 1]]));
    } else if (event.target.classList.contains('ph-copy-full')) {
      // Copy other metadata to form, leave axis poly intact
      // NB: Wait until after the change event has auto-updated the age
      window.setTimeout((newVal) => {
        setDefaultValue(elForm.elements.age, newVal);
      }, 100, elSelected.querySelector('.val-age').textContent);

      setDefaultValue(elForm.elements.rating, elSelected.querySelector('.val-rating').getAttribute('data-value'));
      setDefaultValue(elForm.elements.authority, elSelected.querySelector('.val-authority').getAttribute('data-value'));

      setDefaultValue(elForm.elements.comment,
        (elSelected.querySelector('.val-comment').textContent ? elSelected.querySelector('.val-comment').textContent + '\n' : '') +
        elSelected.querySelector('.val-created_by').getAttribute('data-locale-created_by') + ' ' + elSelected.querySelector('.val-created_by').textContent
      );

      setDefaultValue(elForm.elements.axis_poly, JSON.stringify(axisPoly));
    } else {
      throw new Error('Unknown button ' + event.target.className);
    }

    // NB: We reset rather than change so we don't trigger onbeforeunload
    elForm.reset();
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
    // NB: axis_poly labels are strings, so the JSON contains quotes
    return `<input type="hidden" name="view_poly:${i}" data-stroke="${col}" value="${attribEscape(el.getAttribute('data-axis-poly'))}" />`;
  }).join('\n');
  elForm.dispatchEvent(new window.CustomEvent('element_addremove'));
}

export function init (parent) {
  parent.querySelectorAll('form.annotate-form').forEach((elForm) => {
    const indData = JSON.parse(document.getElementById('ind_data').textContent);

    const refresh = formRefresh.bind(elForm, parseFloat(elForm.getAttribute('data-px-mm')), getLifecycle(indData), indData);
    elForm.addEventListener('change', refresh);
    elForm.addEventListener('reset', (event) => {
      // NB: A form reset event fires before value is updated, so wait until it has
      window.setTimeout(() => refresh({ formReset: true, target: elForm.elements.axis_poly }), 0);
    });

    formUnloadWarning(elForm);

    // Select a point by clicking on its row in axis_poly_table
    elForm.querySelector('#axis_poly_table').addEventListener('click', (event) => {
      const elRow = event.target.closest('tbody > tr[data-idx]');
      if (!elRow || event.target.closest('select')) return;

      const newVal = `axis_poly[${elRow.getAttribute('data-idx')}]`;
      if (elForm.selection.value === newVal) return;
      elForm.selection.value = newVal;
      elForm.selection.dispatchEvent(changeEvent());
    });

    document.querySelector('.ph-all-annotations').addEventListener('click', allAnnotationsClick.bind(document.querySelector('.ph-all-annotations'), elForm));

    populateIndividualData(indData, window.document.querySelector('.individual-data tbody'));

    document.querySelectorAll('#ph-view-poly-show-axis, #ph-view-poly-show-labels').forEach((el) => el.addEventListener('change', (event) => {
      // Trigger addRemove so we update axis / label state
      elForm.dispatchEvent(new window.CustomEvent('element_addremove'));
    }));

    parent.querySelectorAll('button#existing-tab').forEach((elExistingBtn) => {
      // Find matching editor button
      const elEditorBtn = elExistingBtn.closest('ul').querySelector(':scope button#editor-tab');

      if (elExistingBtn.classList.contains('active')) {
        // Selected by default, populate now
        elForm.elements.axis_poly.disabled = true;
        existingAnnotationsPopulate(
          elForm,
          document.querySelector('.ph-all-annotations>table>tbody'));
      }
      // Show existing / new annotation when existing / editor tabs are selected
      // When selecting help/metadata/full-screen, we should show the previous view
      elExistingBtn.addEventListener('shown.bs.tab', function (event) {
        elForm.elements.axis_poly.disabled = true;
        existingAnnotationsPopulate(
          elForm,
          document.querySelector('.ph-all-annotations>table>tbody'));
      });
      elEditorBtn.addEventListener('shown.bs.tab', function (event) {
        elForm.elements.axis_poly.disabled = false;
        existingAnnotationsPopulate(
          elForm,
          null);
      });
    });
  });
}
