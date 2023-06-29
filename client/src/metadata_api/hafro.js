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

  sampleDetail (sampleId) {
    const intSampleId = parseInt(sampleId, 10);
    if (!isFinite(intSampleId)) return Promise.reject(new Error(`Invalid sample ID: ${sampleId}`));

    return this.fetch(`/biota/otolith/sample/${intSampleId}`).then((measures) => {
      return Promise.all(measures.map((m) => this.fetch(`/biota/otolith/${m.measureId}/detail`))).then((ods) => ({
        individuals: measures.map((m, i) => {
          const od = ods[i];

          return {
            id: m.measureId,
            title: m.serialNo,
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
            station: od.sampleResponse.station.number,
            gear: od.sampleResponse.gear.isscfgNo,
            meshSize: od.sampleResponse.meshSize
          };
        })
      }));
    });
  }
}
