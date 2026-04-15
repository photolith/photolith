import { jsonFetch } from './fetch';
import { applyDTState, removeDTState } from './datatables_state';

function individualPopulate (elSelect) {
  if (elSelect.options.length > 0) return;

  elSelect.form.classList.add('rendering');
  return jsonFetch('/search/data/' + removeDTState(window.document.location.search), {}).then((data) => {
    applyDTState(data.data, window.document.location.search).forEach((row) => {
      const opt = new window.Option(row.__str__);

      opt.value = `${row.id}`;
      elSelect.append(opt);
    });
  }).finally(() => {
    Array.from(elSelect.options).forEach((opt) => {
      opt.selected = true;
    });
    elSelect.form.classList.remove('rendering');
  });
}

export function init (parent) {
  parent.querySelectorAll('form#project-form').forEach((elForm) => {
    individualPopulate(elForm.individuals);
  });
}
