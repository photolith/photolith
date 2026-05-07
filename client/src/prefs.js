export function init (parent) {
  // Sync pref-session checkboxes with sessionStorage
  parent.querySelectorAll('input[type=checkbox].pref-session').forEach((elCheckbox) => {
    elCheckbox.checked = (window.sessionStorage.getItem(elCheckbox.id) || (elCheckbox.defaultChecked ? 'on' : 'off')) === 'on';
    elCheckbox.defaultChecked = elCheckbox.checked; // Form reset shouldn't alter our state
    window.sessionStorage.setItem(elCheckbox.id, elCheckbox.checked ? 'on' : 'off');

    elCheckbox.addEventListener('change', (event) => {
      event.target.defaultChecked = event.target.checked; // Form reset shouldn't alter our state
      window.sessionStorage.setItem(event.target.id, event.target.checked ? 'on' : 'off');
    });
  });

  parent.querySelectorAll('select.pref-session').forEach((elSelect) => {
    // Reset initial state based on sessionStorage
    let initValue = window.sessionStorage.getItem(elSelect.id);
    if (initValue !== null) {
      initValue = new Set(JSON.parse(initValue));
      Array.from(elSelect.options).forEach((o) => {
        o.defaultSelected = o.selected = initValue.has(o.value);
      });
    }

    // On change, sync sessionStorage
    elSelect.addEventListener('change', (event) => {
      // Combine options into a new value
      const newValue = Array.from(event.target.options).map((o) => {
        // Form reset shouldn't alter our state
        o.defaultSelected = o.selected;

        return o.selected ? o.value : undefined;
      }).filter((v) => v !== undefined);
      window.sessionStorage.setItem(event.target.id, JSON.stringify(newValue));
    });
  });
}
