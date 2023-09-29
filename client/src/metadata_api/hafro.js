import { displayAlert } from '../alert';

const errorTemplates = {
  is: {
    '"{0}" isn\'t recognisable as a slide label': '"{0}" er ekki auðþekkjanlegt sem skyggnumerki',
    'No otoliths for sample ID': 'Engir otólítar fyrir auðkenni sýnis',
    'Fetching {0} failed ({1})': 'Mistókst að sækja {0} ({1})',
    'Too many ({0}) otoliths for sample ID': 'Of margir ({0}) otólítar fyrir auðkenni sýnis'
  }
};

const metaLabels = {
  en: {
    sampleId: 'Sample Id',
    slideLabel: 'Slide Label',
    serialNo: 'Individual No.',
    length: 'Length',
    sex: 'Sex',
    maturity: 'Maturity',
    species: 'Species',
    cruise: 'Cruise',
    station: 'Station',
    stationYear: 'Station Year',
    stationMonth: 'Station Month',
    stationDate: 'Station Date',
    gear: 'Gear',
    meshSize: 'Mesh Size',
    created_at: 'Uploaded'
  },
  is: {
    sampleId: 'TODO:',
    slideLabel: 'Merking á gleri',
    serialNo: 'Einstaklingur nr.',
    length: 'Lengd',
    sex: 'Kyn',
    maturity: 'Kynþroski',
    species: 'Tegund',
    cruise: 'Leiðangur',
    station: 'Stöð',
    stationYear: 'Dagsetning ár',
    stationMonth: 'Dagsetning mánuður',
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

export default class MetadataApi {
  constructor (lang, baseHref) {
    this.lang = lang;
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

  metaLabels (view) {
    const out = metaLabels[this.lang] || metaLabels.en;
    // If a view given, filter by fieldsFor
    if (view) return Object.fromEntries(fieldsFor[view].map((k) => [k, out[k]]));
    return out;
  }

  /** Given a single individual from sampleDetail(), return a short identifier to label a bounding box */
  individualLabel (ind) {
    return ind.serialNo;
  }

  individualTitle (ind) {
    return ind.slideLabel + ' -- ' + ind.serialNo;
  }

  /** e.g. 537572 TG1-2023/110 1 03 */
  parseSlideLabel (s) {
    const m = s.match(/(?<sampleId>\d+) (?<cruise>[a-zA-Z0-9]+)[-=](?<year>\d+)\/(?<station>\d+) (?<species>\d+) (?<month>\d+)/);
    if (!m) throw this.intlError('"{0}" isn\'t recognisable as a slide label', s);

    return {
      sampleId: parseInt(m.groups.sampleId, 10),
      cruise: [m.groups.cruise, m.groups.year].join('-'),
      station: parseInt(m.groups.station, 10),
      species: parseInt(m.groups.species, 10),
      year: parseInt(m.groups.year, 10),
      month: parseInt(m.groups.month, 10)
    };
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
            out.cruise = lbl.cruise;
            out.station = lbl.station.toString();
            out.stationYear = lbl.year;
            out.stationMonth = lbl.month;
          }
          if (od.sampleResponse) {
            out.gear = od.sampleResponse.gear.isscfgNo;
            out.meshSize = od.sampleResponse.meshSize;
          }

          out.sampleId = od.sampleId.toString();
          out.measureId = od.measureId.toString();
          out.serialNo = od.serialNo.toString();

          // re-build slideLabel based on what we now know
          out.slideLabel = [
            out.sampleId,
            [out.cruise, out.station].join('/'),
            od.speciesDTO.id,
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
