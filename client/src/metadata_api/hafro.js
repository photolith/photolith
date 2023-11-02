import { displayAlert } from '../alert';

const errorTemplates = {
  is: {
    '"{0}" isn\'t recognisable as a slide label': 'Kannast ekki við "{0}" sem merkingu á gleri',
    'No otoliths for sample ID': 'Engar kvarnir eru skráðar á þetta raðnúmer',
    'Fetching {0} failed ({1})': 'Tókst ekki að sækja {0} ({1})',
    'Too many ({0}) otoliths for sample ID': 'Of margar ({0}) kvarnir á þessu raðnúmeri'
  }
};

const metaLabels = {
  en: {
    sampleId: 'Sample Id',
    slideLabel: 'Slide Label',
    individualLabel: 'Individual No.',
    length: 'Length',
    sex: 'Sex',
    maturity: 'Maturity',
    species: 'Species',
    cruise: 'Cruise',
    station: 'Station',
    stationYear: 'Year',
    stationMonth: 'Month',
    stationDate: 'Date',
    gear: 'Gear',
    meshSize: 'Mesh Size',
    created_at: 'Uploaded'
  },
  is: {
    sampleId: 'Raðnúmer sýnis (id)',
    slideLabel: 'Merking á gleri',
    individualLabel: 'Einstaklingur nr.',
    length: 'Lengd',
    sex: 'Kyn',
    maturity: 'Kynþroski',
    species: 'Tegund',
    cruise: 'Leiðangur',
    station: 'Stöð',
    stationYear: 'Ár',
    stationMonth: 'Mánuður',
    stationDate: 'Dagsetning leiðangurs',
    gear: 'Veiðarfæri',
    meshSize: 'Möskvastærð',
    created_at: 'Fært inn'
  }
};

const fieldsFor = {
  search_columns: [
    'sampleId',
    'cruise',
    'station',
    'stationYear',
    'stationMonth',
    'species',
    'length',
    'weight',
    'sex',
    'maturity',
    'created_at'
  ],
  search_filter: [
    'cruise',
    'station',
    'species',
    'length',
    'weight',
    'sex',
    'stationYear',
    'stationMonth',
    'maturity'
  ]
};

const labelHelp = {
  en: [
    'Full label, e.g. <kbd>537572 TG1-2023/110 1 03</kbd>',
    '"(sample-id) (species no)", e.g. <kbd>537572 1</kbd>'
  ],
  is: [
    'Full merking á gleri, t.d. <kbd>537572 TG1-2023/110 1 03</kbd>',
    '"(raðnúmer) (tegund nr.)", t.d. <kbd>537572 1</kbd>'
  ]
};

export default class MetadataApi {
  constructor (lang, baseHref) {
    // Strip -gb from en-gb
    this.lang = lang.replace(/\W.*/, '');
    this.baseHref = baseHref || '';
  }

  fetch (endpoint) {
    return window.fetch(this.baseHref + endpoint).then((resp) => {
      if (!resp.ok) {
        throw this.intlError('Fetching {0} failed ({1})', endpoint, resp.status);
      }
      return resp.json();
    });
  }

  intlError (errTmpl, ...values) {
    if (errorTemplates[this.lang]) {
      errTmpl = errorTemplates[this.lang][errTmpl];
    }
    return new Error(errTmpl.replace(/{(\d)}/g, (_, i) => values[Number(i)]));
  }

  labelHelp () {
    return labelHelp[this.lang];
  }

  metaLabels (view) {
    const out = metaLabels[this.lang] || metaLabels.en;
    // If a view given, filter by fieldsFor
    if (view) return Object.fromEntries(fieldsFor[view].map((k) => [k, out[k]]));
    return out;
  }

  /** Given a single individual from sampleDetail(), return a short identifier to label a bounding box */
  individualLabel (ind) {
    return ind.individualLabel;
  }

  parseSlideLabel (s) {
    let m;

    /** Full: 537572 TG1-2023/110 1 03 */
    m = s.match(/^\s*(?<sampleId>\d+) (?<cruise>[a-zA-Z0-9]+)[-=](?<year>\d+)\/(?<station>\d+) (?<species>\d+) (?<month>\d+)\s*$/);
    if (m) {
      return {
        sampleId: parseInt(m.groups.sampleId, 10),
        cruise: [m.groups.cruise, m.groups.year].join('-'),
        station: parseInt(m.groups.station, 10),
        species: parseInt(m.groups.species, 10),
        year: parseInt(m.groups.year, 10),
        month: parseInt(m.groups.month, 10)
      };
    }

    /** Partial: 537572 1 */
    m = s.match(/^\s*(?<sampleId>\d+)\s+(?<species>\d+)\s*$/);
    if (m) {
      return {
        sampleId: parseInt(m.groups.sampleId, 10),
        species: parseInt(m.groups.species, 10)
      };
    }

    throw this.intlError('"{0}" isn\'t recognisable as a slide label', s);
  }

  sampleDetail (slideLabel) {
    let suppressWarnings = false;
    let lbl;

    slideLabel = slideLabel.trim();
    try {
      lbl = this.parseSlideLabel(slideLabel);
    } catch (error) {
      // Convert parse errors into rejects, so we handle the UI properly
      return Promise.reject(error);
    }

    return this.fetch(`/biota/otolith/sample/${lbl.sampleId}/combined/filter?speciesNo=${lbl.species}`).then((data) => {
      if (data.otoliths.length === 0) throw this.intlError('No otoliths for sample ID');
      if (data.otoliths.length > 50) throw this.intlError('Too many ({0}) otoliths for sample ID', data.otoliths.length);

      // Sort incoming data by serialNo (i.e. individual number)
      data.otoliths.sort((a, b) => a.serialNo - b.serialNo);

      return {
        individuals: data.otoliths.map((od, i) => {
          // NB: Add slideLabel now so it sits at the top
          const out = { slideLabel: null };

          if (od.measureDTO) {
            out.length = od.measureDTO.length;
            out.sex = od.measureDTO.sexNo;
            out.maturity = od.measureDTO.sexualMaturity.sexualMaturityId;
          }
          if (od.speciesDTO) {
            out.species = {
              id: od.speciesDTO.id,
              en: `${od.speciesDTO.englishName} [${od.speciesDTO.code3a}]`,
              is: `${od.speciesDTO.name} [${od.speciesDTO.code3a}]`
            };
          }
          if (od.sampleResponse && od.sampleResponse.station) {
            out.cruise = od.sampleResponse.station.cruise.name;
            out.station = od.sampleResponse.station.number.toString();
            out.stationDate = od.sampleResponse.station.stationDate;
            out.stationYear = (new Date(od.sampleResponse.station.stationDate)).getYear();
            out.stationMonth = (new Date(od.sampleResponse.station.stationDate)).getMonth() + 1;
          } else {
            if (lbl.cruise) out.cruise = lbl.cruise;
            if (lbl.station) out.station = lbl.station.toString();
            if (lbl.year) out.stationYear = lbl.year;
            if (lbl.month) out.stationMonth = lbl.month;
          }
          if (od.sampleResponse) {
            out.gear = od.sampleResponse.gear.isscfgNo;
            out.meshSize = od.sampleResponse.meshSize;
          }

          out.sampleId = od.sampleId.toString();
          out.measureId = od.measureId.toString();
          out.individualLabel = od.serialNo.toString();

          // re-build slideLabel based on what we now know
          if (!out.sampleId || !out.cruise || !out.station || !out.species || !out.stationMonth) {
            console.warn('label', lbl);
            console.warn('API', od);
            console.warn('Combined', out);
            throw this.intlError('Not enough information from API to reconstruct slide label: Contact IT or enter entire slide label');
          }
          out.slideLabel = [
            out.sampleId,
            [out.cruise, out.station].join('/'),
            out.species.id,
            (out.stationMonth < 10 ? '0' : '') + out.stationMonth
          ].join(' ');

          if (!suppressWarnings && out.slideLabel !== slideLabel) {
            displayAlert('warning', `The API returned a slide label of "${out.slideLabel}", you entered "${slideLabel}"`);
            suppressWarnings = true;
          }

          return out;
        })
      };
    });
  }
}
