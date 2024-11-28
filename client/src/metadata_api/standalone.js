import BaseMetadataApi from './base';

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
    ch_individualLabel: 'Individual No.',
    tx_sex: 'Sex',
    tx_species: 'Species'
  }
};

const fieldsFor = {
  search_columns: [
    'ch_slideLabel',
    'ch_individualLabel',
    'tx_sex',
    'tx_species'
  ],
  search_filter: [
    'ch_slideLabel',
    'ch_individualLabel',
    'tx_sex',
    'tx_species'
  ],
  table_form: [ // i.e. ingest metadata table
    'ch_slideLabel',
    'ch_individualLabel',
    'tx_sex',
    'tx_species'
  ]
};

const labelHelp = {
  en: [
    'Full label'
  ]
};

const txHardcoded = {
  sex: [
    { id: 1, en: 'Male' },
    { id: 2, en: 'Female' },
    { id: 3, en: 'Mixed' },
    { id: 4, en: 'Indeterminate' },
    { id: 5, en: 'Unknown' }
  ],
  species: [
    { id: 1, en: 'Cod [COD]', is: '\u00deorskur [COD]' },
    { id: 2, en: 'Haddock [HAD]', is: '\u00ddsa [HAD]' },
    { id: 3, en: 'Saithe [POK]', is: 'Ufsi [POK]' },
    { id: 9, en: 'Atlantic wolffish [CAA]', is: 'Steinb\u00edtur [CAA]' }
  ]
};

export default class MetadataApi extends BaseMetadataApi {
  constructor (lang, baseHref) {
    super(lang);
    this.baseHref = baseHref || '';
    this.intlExtend(this._intlTemplates, intlTemplates);
    this.intlExtend(this._metaLabels, metaLabels);
    this._labelHelp = labelHelp;
    this._fieldsFor = fieldsFor;
    this._txHardcoded = txHardcoded;
  }
}
