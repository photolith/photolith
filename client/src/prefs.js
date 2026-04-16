export function init (parent) {
  // Sync pref-session checkboxes with sessionStorage
  document.querySelectorAll('input[type=checkbox].pref-session').forEach((elCheckbox) => {
    elCheckbox.checked = (window.sessionStorage.getItem(elCheckbox.id) || (elCheckbox.defaultChecked ? 'on' : 'off')) === 'on';
    elCheckbox.defaultChecked = elCheckbox.checked; // Form reset shouldn't alter our state
    elCheckbox.addEventListener('change', (event) => {
      elCheckbox.defaultChecked = elCheckbox.checked; // Form reset shouldn't alter our state
      window.sessionStorage.setItem(elCheckbox.id, event.target.checked ? 'on' : 'off');
    });
  });
}
