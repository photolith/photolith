const intlTemplates = {
  en: {
    how_many_individuals: [
      'How many individuals are contained on this image? Either:',
      '',
      '• The total number of individuals, e.g. "10" for individuals 1..10',
      '• The labels of each individual, each separated with a space, e.g. "a b c" for 3 individuals'
    ].join('\n')
  },
  is: {
    how_many_individuals: [
      'Hversu margir einstaklingar eru á þessari mynd? Annaðhvort:',
      '',
      '• Heildarfjöldi einstaklinga, s.s. "10" fyrir einstaklinga 1..10',
      '• Merki hvers einstaklings, hvert aðskilið með bili, t.d. "a b c" fyrir 3 einstaklinga'
    ].join('\n')
  }
};

export default class MetadataApi {
  constructor (lang, baseHref) {
    // Strip -gb from en-gb
    this.lang = lang.replace(/\W.*/, '');
    this.baseHref = baseHref || '';
    this._intlTemplates = intlTemplates;
    this._metaLabels = {};
    this._fieldsFor = {};
  }

  labelHelp () {
    return {
      en: [
      ]
    };
  }

  metaLabels (view) {
    const out = this._metaLabels[this.lang] || this._metaLabels.en;
    // If a view given, filter by fieldsFor
    if (view) return Object.fromEntries(this._fieldsFor[view].map((k) => [k, out[k]]));
    return out;
  }

  /** Given a single individual from sampleDetail(), return a short identifier to label a bounding box */
  individualLabel (ind) {
    return ind.ch_individualLabel;
  }

  sampleDetail (slideLabel) {
    let individuals = window.prompt(this.tmpl('how_many_individuals'));

    // Pressed cancel
    if (individuals === null) return Promise.resolve(null);

    if (individuals === '') {
      // Empty string: assume single individual
      individuals = [1];
    } else if (isFinite(Number(individuals))) {
      // Numeric string: count of individuals
      individuals = Array.from({ length: Number(individuals) }, (_, i) => i + 1);
    } else {
      // Space-separated list of individual names
      individuals = individuals.trim().split(/\s+/);
    }

    return Promise.resolve(individuals.map((indId) => ({
      ch_slideLabel: slideLabel,
      ch_individualLabel: indId
    })));
  }

  txFor (txName, txCurrent) {
    // NB: Assumes that {{ full_taxonomy|json_script:"full_taxonomy" }} has happened in template
    if (!this._fullTx) {
      const txEl = document.getElementById('full_taxonomy');
      this._fullTx = JSON.parse(txEl.textContent);
    }
    const out = this._fullTx[txName] || [];

    // Replace / append txCurrent
    if (txCurrent) {
      const idxCurrent = out.findIndex((tx) => tx.id === txCurrent.id);
      out[idxCurrent === -1 ? out.length : idxCurrent] = txCurrent;
    }

    return out;
  }

  fetch (endpoint) {
    return window.fetch(this.baseHref + endpoint).then((resp) => {
      if (!resp.ok) {
        throw this.intlError('Fetching {0} failed ({1})', endpoint, resp.status);
      }
      return resp.json();
    });
  }

  tmpl (tmpl, ...values) {
    if (this._intlTemplates[this.lang]) {
      tmpl = this._intlTemplates[this.lang][tmpl] || tmpl;
    }
    return tmpl.replace(/{(\d)}/g, (_, i) => values[Number(i)]);
  }

  intlError (errTmpl, ...values) {
    return new Error(this.tmpl(errTmpl, ...values));
  }

  intlExtend (target, source) {
    for (const lang of Object.keys(source)) {
      if (!(lang in target)) target[lang] = {};
      Object.assign(target[lang], source[lang]);
    }
  }
}
