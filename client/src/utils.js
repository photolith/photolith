/** Set value & default value of form element (el) to (newDefValue) */
export function setDefaultValue (el, newDefValue) {
  if (el.tagName === 'SELECT') {
    let found = false;

    Array.from(el.options).forEach((o, i) => {
      o.selected = (o.value === newDefValue);
      o.defaultSelected = (o.value === newDefValue);
      found = true;
    });

    if (!found) {
      // If we didn't find the value, add a new one
      const newOption = new window.Option(
        newDefValue
      );
      newOption.selected = true;
      newOption.defaultSelected = true;
      el.add(newOption);
    }
  } else {
    el.value = newDefValue;
    el.defaultValue = newDefValue;
  }

  return el;
}
