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
}
