const metaLabels = {
  en: {
    measureId: 'measureId',
    slideLabel: 'Slide Label',
    serialNo: 'serialNo',
    length: 'Length',
    sex: 'Sex',
    maturity: 'Maturity',
    species: 'Species',
    cruise: 'Cruise',
    station: 'Station',
    stationDate: 'Station Date',
    gear: 'Gear',
    meshSize: 'Mesh Size'
  },
  is: {
    measureId: 'measureId',
    slideLabel: 'Upplýsingar á gleri',
    serialNo: 'serialNo',
    length: 'Lengd',
    sex: 'Kyn',
    maturity: 'Kynþroski',
    species: 'Tegund',
    cruise: 'Leiðangur',
    station: 'Stöð',
    stationDate: 'Dags',
    gear: 'Veiðarfæri',
    meshSize: 'Möskvastærð'
  }
};

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

  sampleDetail (sampleId) {
    const intSampleId = parseInt(sampleId, 10);
    if (!isFinite(intSampleId)) return Promise.reject(new Error(`Invalid sample ID: ${sampleId}`));

    return this.fetch(`/biota/otolith/sample/${intSampleId}`).then((data) => {
      if (data.otoliths.length === 0) throw new Error('No otoliths for sample ID');
      if (data.otoliths.length > 50) throw new Error(`Too many (${data.otoliths.length}) otoliths for sample ID`);

      // Sort incoming data by serialNo (i.e. individual number)
      data.otoliths.sort((a, b) => a.serialNo - b.serialNo);

      return Promise.all(data.otoliths.map((m) => this.fetch(`/biota/otolith/${m.measureId}/detail`))).then((ods) => ({
        individuals: data.otoliths.map((m, i) => {
          const od = ods[i];
          const out = {};

          if (od.sampleResponse && od.speciesDTO) {
            out.slideLabel = [
              od.sampleResponse.sampleId,
                `${od.sampleResponse.station.cruise.name}/${od.sampleResponse.station.number}`,
                od.speciesDTO.id,
                (new Date(od.sampleResponse.station.stationDate)).getMonth() + 1
            ].join(' ');
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
          }
          if (od.sampleResponse) {
            out.gear = od.sampleResponse.gear.isscfgNo;
            out.meshSize = od.sampleResponse.meshSize;
          }

          out.sampleId = sampleId.toString();
          out.measureId = m.measureId.toString();
          out.serialNo = m.serialNo.toString();
          return out;
        })
      }));
    });
  }
}
