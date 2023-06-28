function htmlEscape (s) {
  return (new window.Option(s)).innerHTML;
}

function formRefresh (event) {
  const elForm = event.target.form;

  // Can progress iff all form elements are filled in
  elForm.saveAndNext.disabled = !!Array.from(elForm.elements).find((el) => !el.value);

  if (event.target.name === 'sample') {
    // Update rest of form to match new sample
    return window.mApi.sampleDetail(event.target.value).then((sd) => {
      elForm.individual.innerHTML = sd.individuals.map((ind, i) => {
        return new window.Option(ind.title, ind.id, i === 0, i === 0).outerHTML;
      });
    }).catch((err) => {
      elForm.individual.innerHTML = '';
      throw err;
    }).finally(() => {
      elForm.individual.dispatchEvent(new window.UIEvent('change', {
        view: window,
        bubbles: true,
        cancelable: true
      }));
    });
  }

  if (event.target.name === 'individual') {
    const elIndividualDataBody = elForm.querySelector(':scope .individual-data tbody');

    if (!event.target.value) {
      // No individuals, so nothing should be selected
      elForm.individualData.value = '';
      elIndividualDataBody.innerHTML = '';
      return;
    }

    return window.mApi.individualDetail(elForm.sample.value, event.target.value).then((ids) => {
      elForm.individualData.value = JSON.stringify(ids);
      elIndividualDataBody.innerHTML = Object.keys(ids).map((k) => `<tr>
        <td>${htmlEscape(k)}</td>
        <td><code>${htmlEscape(ids[k])}</code></td>
      </tr>`).join('\n');
    }).catch((err) => {
      elForm.individualData.value = '';
      elIndividualDataBody.innerHTML = '';
      throw err;
    }).finally(() => {
      elForm.individualData.dispatchEvent(new window.UIEvent('change', {
        view: window,
        bubbles: true,
        cancelable: true
      }));
    });
  }
}

export function init (window) {
  window.document.querySelectorAll('form.ingest-form').forEach((elForm) => {
    elForm.addEventListener('change', formRefresh);
    elForm.addEventListener('submit', (event) => {
      event.preventDefault();

      if (elForm.individual.selectedIndex < elForm.individual.options.length - 1) {
        elForm.individual.selectedIndex++;
        formRefresh({ target: elForm.individual });
        elForm.dispatchEvent(new window.CustomEvent('advance_individual'));
      }
    });
  });
}
