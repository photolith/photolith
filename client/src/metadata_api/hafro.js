import { displayAlert } from '../alert';
import BaseMetadataApi from './base';

const intlTemplates = {
  en: {
    how_many_individuals: [
      'The database could not find the label "{0}". Is this a typo?',
      'Press [Cancel] if so.',
      '',
      'Alternatively, enter how many individuals are contained on this image and press [OK]. Either:',
      '• The total number of individuals, e.g. "10" for individuals 1..10',
      '• The labels of each individual, each separated with a space, e.g. "a b c" for 3 individuals'
    ].join('\n')
  },
  is: {
    how_many_individuals: [
      '"{0}" fannst ekki í gagnagrunni. Er þetta rétt slegið inn?', 
      'Ýttu á [Cancel] ef svo er.',
      '',
      'Ef merkingin er rétt og er ekki til í gagnagrunninum, sláðu þá inn fjölda einstaklinga sem eru á myndinni og ýttu á [OK].', 
      'Sláðu annaðhvort inn:',
      '• Heildarfjölda einstaklinga, s.s. "10" fyrir einstaklinga 1 upp í 10',
      '• Merki hvers einstaklings, aðskilið með bili, t.d. "a b c" fyrir 3 einstaklinga með merkin a, b og c'
    ].join('\n'),
    '"{0}" isn\'t recognisable as a slide label': 'Kannast ekki við "{0}" sem auðkenni',
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
    tx_sampleType: 'Sample Type',
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
    ch_sampleId: 'Raðnúmer (id)',
    ch_slideLabel: 'Merking á gleri',
    ch_individualLabel: 'Einstaklingur nr.',
    tx_sampleType: 'Tegund sýnis',
    nm_length: 'Lengd',
    nm_weight: 'Þyngd',
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
    num_annotations: 'Fjöldi aldursmerkinga',
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
    'ch_individualLabel',
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
    'tx_sampleType',
    'tx_maturity'
  ],
  table_form: [ // i.e. ingest metadata table
    'ch_sampleId',
    'ch_slideLabel',
    'ch_individualLabel',
    'tx_sampleType',
    'nm_length',
    'nm_weight',
    'tx_sex',
    'tx_maturity',
    'tx_species',
    'ch_cruise',
    'ch_station',
    'nm_stationYear',
    'nm_stationMonth',
    'ch_gear',
    'nm_meshSize'
  ]
};

const labelHelp = {
  en: [
    'Full label, e.g. <kbd>537572 TG1-2023/110 1 03</kbd>',
    '"(sample-id) (species no)", e.g. <kbd>537572 1</kbd>',
    '"(cruise)/(station) (species no)", e.g. <kbd>B17-79/25 9</kbd>'
  ],
  is: [
    'Full merking á gleri, t.d. <kbd>537572 TG1-2023/110 1 03</kbd>',
    '"(raðnúmer) (tegund nr.)", t.d. <kbd>537572 1</kbd>',
    '"(leiðangur)/(stöð) (tegund nr.)", t.d. <kbd>B17-79/25 9</kbd>'
  ]
};

const txHardcoded = {
  sex: [
    { id: 1, en: 'Male [M]', is: 'Hængur' },
    { id: 2, en: 'Female [F]', is: 'Hrygna' },
    { id: 3, en: 'Mixed [X]', is: 'Blandað' },
    { id: 4, en: 'Indeterminate [N]', is: 'Óákveðið' },
    { id: 5, en: 'Unknown [U]', is: 'Ekki vitað' }
  ],
  sampleType: [
    { id: 1, en: 'Otolith', is: 'Kvörn' },
    { id: 2, en: 'Scale', is: 'Hreistur' }
  ]
};

export default class MetadataApi extends BaseMetadataApi {
  constructor (lang, baseHref) {
    super(lang);
    this.baseHref = baseHref || '';
    this.intlExtend(this._intlTemplates, intlTemplates);
    this.intlExtend(this._metaLabels, metaLabels);
    this._fieldsFor = fieldsFor;
    this._txHardcoded = txHardcoded;
  }

  labelHelp () {
    return labelHelp[this.lang];
  }

  parseSlideLabel (s) {
    let m;

    /** Full: 537572 TG1-2023/110 1 03 */
    m = s.match(/^\s*(?<sampleId>\d{4,}) (?<cruise>[a-zA-Z0-9]+)[-=](?<year>\d{2,4})\/(?<station>\d+) (?<species>\d+) (?<month>\d+)\s*$/);
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
    m = s.match(/^\s*(?<sampleId>\d{4,})\s+(?<species>\d+)\s*$/);
    if (m) {
      return {
        sampleId: parseInt(m.groups.sampleId, 10),
        species: parseInt(m.groups.species, 10)
      };
    }

    /** Partial: TG1-2023/110 1 */
    m = s.match(/^\s*(?<cruise>[a-zA-Z0-9]+)[-=](?<year>\d{2,4})\/(?<station>\d+) (?<species>\d+)\s*$/);
    if (m) {
      return {
        cruise: [m.groups.cruise, m.groups.year].join('-'),
        station: parseInt(m.groups.station, 10),
        species: parseInt(m.groups.species, 10),
        year: parseInt(m.groups.year, 10)
      };
    }

    throw this.intlError('"{0}" isn\'t recognisable as a slide label', s);
  }

  urlFor (lbl) {
    if (lbl.sampleId && lbl.species) {
      return `/biota/otolith/sample/${lbl.sampleId}/combined/filter?speciesNo=${lbl.species}`;
    }
    if (lbl.cruise && lbl.station && lbl.species) {
      return `/biota/otolith/sample/combined/filter?speciesNo=${lbl.species}&cruise=${lbl.cruise}&stationNo=${lbl.station}`;
    }
    throw new Error('Not enough data available for API query: ' + JSON.stringify(lbl));
  }

  sampleDetail (slideLabel) {
    let suppressWarnings = false;
    let lbl;

    slideLabel = slideLabel.trim();
    try {
      lbl = this.parseSlideLabel(slideLabel);
    } catch (error) {
      return super.sampleDetail(slideLabel).then((individuals) => {
        // Pressed cancel, so reject with original error
        if (individuals === null) throw error;
        return individuals;
      });
    }

    return this.fetch(this.urlFor(lbl)).then((data) => {
      if (Array.isArray(data) && data.length === 1) data = data[0]; // NB: Temporary bodge for sample/combined form output being wrapped in an array
      if (!data || !data.otoliths || data.otoliths.length === 0) throw this.intlError('No otoliths for sample ID');
      if (data.otoliths.length > 500) throw this.intlError('Too many ({0}) otoliths for sample ID', data.otoliths.length);

      // Sort incoming data by serialNo (i.e. individual number)
      data.otoliths.sort((a, b) => a.serialNo - b.serialNo);

      return data.otoliths.map((od, i) => {
        // NB: Add ch_slideLabel now so it sits at the top
        const out = { ch_slideLabel: null };

        if (od.measureDTO) {
          out.nm_length = od.measureDTO.length;
          out.tx_sex = od.measureDTO.sexNo;
          out.tx_sex = this.txFor('sex')[out.tx_sex] || { id: out.tx_sex, en: 'Unknown' };
          out.tx_maturity = od.measureDTO.sexualMaturity.sexualMaturityId;
          // NB: We don't have a taxonomy for this yet
          out.tx_maturity = { id: out.tx_maturity, en: 'Unknown' };
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

        out.tx_sampleType = txHardcoded.sampleType[0];
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
      });
    });
  }
}
