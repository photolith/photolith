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

const metaLabels = {
  en: {
    ch_slideLabel: 'Slide Label',
    ch_individualLabel: 'Individual No.'
  }
};

const labelHelp = {
  en: [
    'Full label'
  ]
};

export default class MetadataApi {
  constructor (lang, baseHref) {
    // Strip -gb from en-gb
    this.lang = lang.replace(/\W.*/, '');
    this.baseHref = baseHref || '';
    this._intlTemplates = intlTemplates;
    this._metaLabels = metaLabels;
    this._fieldsFor = {};
    this._labelHelp = labelHelp;
    this._txHardcoded = {};
  }

  /** Return a list of strings to display as instructions for what to put as a slide label */
  labelHelp () {
    return this._labelHelp[this.lang] || this._labelHelp.en || [];
  }

  metaLabels (view) {
    const out = this._metaLabels[this.lang] || this._metaLabels.en || {};
    // If a view given & we have a filter, filter by fieldsFor
    if (this._fieldsFor[view]) return Object.fromEntries(this._fieldsFor[view].map((k) => [k, out[k]]));
    return out;
  }

  /** Given a single individual from sampleDetail(), return a short identifier to label a bounding box */
  individualLabel (ind) {
    return ind.ch_individualLabel;
  }

  /** Returns a list of metadata, one per individual on-slide, for a given (slideLabel) string */
  sampleDetail (slideLabel) {
    let individuals = window.prompt(this.tmpl('how_many_individuals', slideLabel));

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

  /** Returns all possible taxonomy values of the (txName) taxonomy, as a list of {(i): {id: (i), en: "..."}}
    * Optionally ensuring that the (txCurrent) taxonomy item is included
    */
  txFor (txName, txCurrent) {
    function toObj (ar) {
      return !ar ? {} : ar.reduce((a, v) => ({ ...a, [v.id]: v }), {});
    }

    // NB: Assumes that {{ full_taxonomy|json_script:"full_taxonomy" }} has happened in template
    if (!this._fullTx) {
      const txEl = document.getElementById('full_taxonomy');
      const txServer = JSON.parse(txEl ? txEl.textContent : '{}');

      this._fullTx = {};
      for (const txName of new Set([].concat(Object.keys(this._txHardcoded), Object.keys(txServer)))) {
        this._fullTx[txName] = Object.assign(
          {},
          toObj(this._txHardcoded[txName]),
          toObj(txServer[txName])
        );
      }
    }

    let out = this._fullTx[txName] || {};
    // Replace / append txCurrent
    if (txCurrent) {
      out = Object.assign({}, out); // Shallow copy, so we don't replace original
      out[txCurrent.id] = txCurrent;
    }

    return out;
  }

  /** Wrapper around window.fetch, adding baseHref & internationalised errors */
  fetch (endpoint) {
    return window.fetch(this.baseHref + endpoint).then((resp) => {
      if (!resp.ok) {
        throw this.intlError('Fetching {0} failed ({1})', endpoint, resp.status);
      }
      return resp.json();
    });
  }

  /** Simple templating language */
  tmpl (tmpl, ...values) {
    if (this._intlTemplates[this.lang]) {
      tmpl = this._intlTemplates[this.lang][tmpl] || tmpl;
    }
    return tmpl.replace(/{(\d)}/g, (_, i) => values[Number(i)]);
  }

  intlError (errTmpl, ...values) {
    return new Error(this.tmpl(errTmpl, ...values));
  }

  /** Merge per-language objects (source) into (target) */
  intlExtend (target, source) {
    for (const lang of Object.keys(source)) {
      if (!(lang in target)) target[lang] = {};
      Object.assign(target[lang], source[lang]);
    }
  }
}
