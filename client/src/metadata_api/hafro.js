const metaLabels = {
  en: {
    id: 'ID',
    title: 'Title',
    slideLabel: 'Slide Label',
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
    id: 'ID',
    title: 'Titill',
    slideLabel: 'Skyggnumerki',
    length: 'Lengd',
    sex: 'Kynlíf',
    maturity: 'Þroska',
    species: 'Tegundir',
    cruise: 'Sigling',
    station: 'Stöð',
    stationDate: 'Stöðvardagur',
    gear: 'Gír',
    meshSize: 'Möskvastærð'
  }
};

export default class MetadataApi {
  constructor (baseHref) {
    this.baseHref = baseHref;
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
    return ind.title;
  }

  individualTitle (ind, lang) {
    return ind.slideLabel + ' -- ' + ind.title;
  }

  sampleDetail (sampleId) {
    const intSampleId = parseInt(sampleId, 10);
    if (!isFinite(intSampleId)) return Promise.reject(new Error(`Invalid sample ID: ${sampleId}`));

    return this.fetch(`/biota/otolith/sample/${intSampleId}`).then((measures) => {
      return Promise.all(measures.map((m) => this.fetch(`/biota/otolith/${m.measureId}/detail`))).then((ods) => ({
        individuals: measures.map((m, i) => {
          const od = ods[i];

          return {
            id: m.measureId.toString(),
            title: m.serialNo.toString(),
            slideLabel: [
              od.sampleResponse.sampleId,
                `${od.sampleResponse.station.cruise.name}/${od.sampleResponse.station.number}`,
                od.speciesDTO.id,
                (new Date(od.sampleResponse.station.stationDate)).getMonth() + 1
            ].join(' '),
            length: od.measureDTO.length,
            sex: od.measureDTO.sexNo,
            maturity: od.measureDTO.sexualMaturity.sexualMaturityId,
            species: {
              id: od.speciesDTO.id,
              en: `${od.speciesDTO.englishName} [${od.speciesDTO.code3a}]`,
              is: `${od.speciesDTO.englishName} [${od.speciesDTO.code3a}]`
            },
            cruise: od.sampleResponse.station.cruise.name,
            station: od.sampleResponse.station.number.toString(),
            stationDate: od.sampleResponse.station.stationDate,
            gear: od.sampleResponse.gear.isscfgNo,
            meshSize: od.sampleResponse.meshSize
          };
        })
      }));
    });
  }
}
