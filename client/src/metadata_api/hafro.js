const metaLabels = {
  en: {
    slideLabel: 'Slide Label',
    serialNo: 'Individual No.',
    length: 'Length',
    sex: 'Sex',
    maturity: 'Maturity',
    species: 'Species',
    cruise: 'Cruise',
    station: 'Station',
    stationDate: 'Station Date',
    gear: 'Gear',
    meshSize: 'Mesh Size',
    created_at: 'Uploaded'
  },
  is: {
    slideLabel: 'Upplýsingar á gleri',
    serialNo: 'TODO',
    length: 'Lengd',
    sex: 'Kyn',
    maturity: 'Kynþroski',
    species: 'Tegund',
    cruise: 'Leiðangur',
    station: 'Stöð',
    stationDate: 'Dags',
    gear: 'Veiðarfæri',
    meshSize: 'Möskvastærð',
    created_at: 'TODO'
  }
};

/** Return zero-padded month string from (d) */
function formattedMonth (d) {
  const m = d.getMonth() + 1;

  return (m < 10 ? '0' : '') + m;
}

/** e.g. 537572 TG1-2023/110 1 03 */
function parseSlideLabel (s) {
  const m = s.match(/(?<sampleId>\d+) (?<cruise>[a-zA-Z0-9\-=]+)\/(?<station>\d+) (?<species>\d+) (?<month>\d+)/);
  if (!m) throw new Error(`"${s}" isn't recognisable as a slide label`);

  return {
    full: m[0],
    sampleId: parseInt(m.groups.sampleId, 10),
    cruise: m.groups.cruise,
    station: parseInt(m.groups.station, 10),
    species: parseInt(m.groups.species, 10),
    month: parseInt(m.groups.month, 10)
  };
}

export default class MetadataApi {
  constructor (baseHref) {
    this.baseHref = baseHref || '';
  }

  fetch (endpoint) {
    return window.fetch(this.baseHref + endpoint).then((resp) => {
      if (!resp.ok) {
        throw new Error(`Fetching ${endpoint} failed (${resp.status})`);
      }
      return resp.json();
    });
  }

  metaLabels (lang) {
    return metaLabels[lang] || metaLabels.en;
  }

  /** Given a single individual from sampleDetail(), return a short identifier to label a bounding box */
  individualLabel (ind) {
    return ind.serialNo;
  }

  individualTitle (ind, lang) {
    return ind.slideLabel + ' -- ' + ind.serialNo;
  }

  sampleDetail (slideLabel) {
    const lbl = parseSlideLabel(slideLabel);

    return this.fetch(`/biota/otolith/sample/${lbl.sampleId}/combined/filter?speciesNo=${lbl.species}`).then((data) => {
      if (data.otoliths.length === 0) throw new Error('No otoliths for sample ID');
      if (data.otoliths.length > 50) throw new Error(`Too many (${data.otoliths.length}) otoliths for sample ID`);

      // Sort incoming data by serialNo (i.e. individual number)
      data.otoliths.sort((a, b) => a.serialNo - b.serialNo);

      return {
        individuals: data.otoliths.map((od, i) => {
          const out = {};

          if (od.sampleResponse && od.speciesDTO) {
            out.slideLabel = [
              od.sampleResponse.sampleId,
                `${od.sampleResponse.station.cruise.name}/${od.sampleResponse.station.number}`,
                od.speciesDTO.id,
                formattedMonth(new Date(od.sampleResponse.station.stationDate))
            ].join(' ');
          } else {
            out.slideLabel = lbl.full;
          }
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
          } else {
            out.cruise = lbl.cruise;
            out.station = lbl.station.toString();
          }
          if (od.sampleResponse) {
            out.gear = od.sampleResponse.gear.isscfgNo;
            out.meshSize = od.sampleResponse.meshSize;
          }

          out.sampleId = od.sampleId.toString();
          out.measureId = od.measureId.toString();
          out.serialNo = od.serialNo.toString();
          return out;
        })
      };
    });
  }
}
