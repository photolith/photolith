import { changeEvent } from './events';
import { jsonFetch } from './fetch';
import { applyDTState, removeDTState } from './datatables_state';

function selectPopulate (elSelect) {
  return jsonFetch('/search/data/' + removeDTState(window.document.location.search), {}).then((data) => {
    applyDTState(data.data, window.document.location.search).forEach((row) => {
      const opt = new window.Option(row.__str__);

      opt.value = `/annotate/${row.id}/${window.document.location.search}`;
      elSelect.append(opt);
    });

    selectRefresh(elSelect);
  });
}

function selectRefresh (elSelect) {
  if (document.location.pathname === '/annotate/') {
    // Select 0'th return item
    elSelect.options[0].selected = true;
  } else {
    // Remove everything after /annotate/3/
    const pathBase = document.location.pathname.replace(/(\d+\/).*/, '$1');
    // selected iff URL matches pathBase
    Array.from(elSelect.options).forEach((opt) => {
      opt.selected = opt.value.startsWith(pathBase);
    });
  }

  // Remove disabled now a real item is selected
  elSelect.options[0].disabled = false;
}

function selectNudge (elSelect, action) {
  const delta = action === 'next' ? 1 : action === 'prev' ? -1 : 0;
  if (delta === 0) return;

  // Work out new index, within bounds of select
  // NB: lower bound is 1, so we don't go back to search
  const newIndex = Math.max(1, Math.min(elSelect.length - 1, elSelect.selectedIndex + delta));

  if (newIndex !== elSelect.selectedIndex) {
    elSelect.selectedIndex = newIndex;
    elSelect.dispatchEvent(changeEvent());
  }
}

export function init (parent) {
  parent.querySelectorAll('.ph-annotate-select-bar').forEach((elSelectBar) => {
    const elSelect = elSelectBar.querySelector(':scope select');
    selectPopulate(elSelect);

    elSelectBar.addEventListener('click', (event) => {
      selectNudge(elSelect, event.target.getAttribute('data-action'));
    });
    elSelectBar.addEventListener('change', (event) => {
      window.setTimeout(() => {
        window.location.href = event.target.value;
      }, 300);
    });
    window.addEventListener('pageshow', (event) => {
      // Make sure select state matches URL after a forward/back
      selectRefresh(elSelect);
    });
  });
}
