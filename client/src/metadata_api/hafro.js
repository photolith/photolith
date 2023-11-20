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
    ch_sampleId: 'Sample Id',
    ch_slideLabel: 'Slide Label',
    ch_individualLabel: 'Individual No.',
    nm_length: 'Length',
    nm_weight: 'Weight',
    tx_sex: 'Sex',
    tx_maturity: 'Maturity',
    tx_species: 'Species',
    ch_cruise: 'Cruise',
    ch_station: 'Station',
    nm_stationYear: 'Year',
    nm_stationMonth: 'Month',
    dt_stationDate: 'Date',
    ch_gear: 'Gear',
    nm_meshSize: 'Mesh Size',
    num_annotations: '# Annotations',
    dt_created_at: 'Uploaded'
  },
  is: {
    ch_sampleId: 'Raðnúmer sýnis (id)',
    ch_slideLabel: 'Merking á gleri',
    ch_individualLabel: 'Einstaklingur nr.',
    nm_length: 'Lengd',
    nm_weight: 'þyngd',
    tx_sex: 'Kyn',
    tx_maturity: 'Kynþroski',
    tx_species: 'Tegund',
    ch_cruise: 'Leiðangur',
    ch_station: 'Stöð',
    nm_stationYear: 'Ár',
    nm_stationMonth: 'Mánuður',
    dt_stationDate: 'Dagsetning leiðangurs',
    ch_gear: 'Veiðarfæri',
    nm_meshSize: 'Möskvastærð',
    num_annotations: '# Aldursmerkingar',
    dt_created_at: 'Fært inn'
  }
};

const fieldsFor = {
  search_columns: [
    'ch_sampleId',
    'ch_cruise',
    'ch_station',
    'nm_stationYear',
    'nm_stationMonth',
    'tx_species',
    'num_annotations',
    'nm_length',
    'nm_weight',
    'tx_sex',
    'tx_maturity',
    'dt_created_at'
  ],
  search_filter: [
    'ch_cruise',
    'ch_station',
    'tx_species',
    'nm_length',
    'nm_weight',
    'tx_sex',
    'nm_stationYear',
    'nm_stationMonth',
    'tx_maturity'
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
    return ind.ch_individualLabel;
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
      if (data.otoliths.length > 500) throw this.intlError('Too many ({0}) otoliths for sample ID', data.otoliths.length);

      // Sort incoming data by serialNo (i.e. individual number)
      data.otoliths.sort((a, b) => a.serialNo - b.serialNo);

      return {
        individuals: data.otoliths.map((od, i) => {
          // NB: Add ch_slideLabel now so it sits at the top
          const out = { ch_slideLabel: null };

          if (od.measureDTO) {
            out.nm_length = od.measureDTO.length;
            out.tx_sex = od.measureDTO.sexNo;
            out.tx_maturity = od.measureDTO.sexualMaturity.sexualMaturityId;
          }
          if (od.speciesDTO) {
            out.tx_species = {
              id: od.speciesDTO.id,
              en: `${od.speciesDTO.englishName} [${od.speciesDTO.code3a}]`,
              is: `${od.speciesDTO.name} [${od.speciesDTO.code3a}]`
            };
          }
          if (od.sampleResponse && od.sampleResponse.station) {
            out.ch_cruise = od.sampleResponse.station.cruise.name;
            out.ch_station = od.sampleResponse.station.number.toString();
            out.dt_stationDate = od.sampleResponse.station.stationDate;
            out.nm_stationYear = (new Date(od.sampleResponse.station.stationDate)).getFullYear();
            out.nm_stationMonth = (new Date(od.sampleResponse.station.stationDate)).getMonth() + 1;
          } else {
            if (lbl.cruise) out.ch_cruise = lbl.cruise;
            if (lbl.station) out.ch_station = lbl.station.toString();
            if (lbl.year) out.nm_stationYear = lbl.year;
            if (lbl.month) out.nm_stationMonth = lbl.month;
          }
          if (od.sampleResponse) {
            out.ch_gear = od.sampleResponse.gear.isscfgNo;
            out.nm_meshSize = od.sampleResponse.meshSize;
          }

          out.ch_sampleId = od.sampleId.toString();
          out.ch_measureId = od.measureId.toString();
          out.ch_individualLabel = od.serialNo.toString();

          // re-build slideLabel based on what we now know
          if (!out.ch_sampleId || !out.ch_cruise || !out.ch_station || !out.tx_species || !out.nm_stationMonth) {
            console.warn('label', lbl);
            console.warn('API', od);
            console.warn('Combined', out);
            throw this.intlError('Not enough information from API to reconstruct slide label: Contact IT or enter entire slide label');
          }
          out.ch_slideLabel = [
            out.ch_sampleId,
            [out.ch_cruise, out.ch_station].join('/'),
            out.tx_species.id,
            (out.nm_stationMonth < 10 ? '0' : '') + out.nm_stationMonth
          ].join(' ');

          if (!suppressWarnings && out.ch_slideLabel !== slideLabel) {
            displayAlert('warning', `The API returned a slide label of "${out.ch_slideLabel}", you entered "${slideLabel}"`);
            suppressWarnings = true;
          }

          return out;
        })
      };
    });
  }
}
