function htmlEscape (s) {
  return (new window.Option(s)).innerHTML;
}

function langSelect (obj) {
  // NB: If it doesn't have either 'is' or 'en' property, it's probably a string already
  return obj[document.documentElement.lang] || obj.en || obj;
}

function formRefresh (event) {
  const elForm = event.target.form;

  // Can progress iff all form elements are filled in
  elForm.save.disabled = !!Array.from(elForm.elements).find((el) => el.name !== 'selected_individual' && !el.value);

  if (event.target.name === 'sample') {
    // Update rest of form to match new sample
    return window.mApi.sampleDetail(event.target.value).then((sd) => {
      elForm.querySelector(':scope .individuals').innerHTML = sd.individuals.map((ind, i) => {
        return `
          <input type="hidden" name="individuals[${i}][data]" value="">
          <input type="hidden" name="individuals[${i}][bounding_box]" value="">
        `;
      }).join('\n');
      sd.individuals.forEach((ind, i) => {
        elForm[`individuals[${i}][data]`].value = JSON.stringify(ind);
      });
      elForm.selected_individual.value = '';
      elForm.dispatchEvent(new window.CustomEvent('load_individuals', { detail: sd.individuals }));
    }).catch((err) => {
      elForm.querySelector(':scope .individuals').innerHTML = '';
      elForm.selected_individual.value = '';
      throw err;
    }).finally(() => {
      elForm.selected_individual.dispatchEvent(new window.UIEvent('change', {
        view: window,
        bubbles: true,
        cancelable: true
      }));
    });
  }

  if (event.target.name === 'selected_individual') {
    const elIndividualDataBody = elForm.querySelector(':scope .individual-data tbody');
    const ids = JSON.parse((elForm[`individuals[${event.target.value}][data]`] || {}).value || '{}');

    elIndividualDataBody.innerHTML = Object.keys(ids).map((k) => `<tr>
      <td>${htmlEscape(k)}</td>
      <td><code>${htmlEscape(langSelect(ids[k]))}</code></td>
    </tr>`).join('\n');
  }
}

export function init (window) {
  window.document.querySelectorAll('form.ingest-form').forEach((elForm) => {
    elForm.addEventListener('change', formRefresh);
    elForm.addEventListener('submit', (event) => {
      event.preventDefault();
    });
  });
}
