export default class MetadataApi {
  constructor (lang, baseHref) {
    // Strip -gb from en-gb
    this.lang = lang.replace(/\W.*/, '');
    this.baseHref = baseHref || '';
    this._intlTemplates = {};
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
