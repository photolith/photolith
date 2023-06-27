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
      return {
        individuals: measures.map((m) => ({
          id: m.measureId,
          title: m.serialNo
        }))
      };
    });
  }

  individualDetail (_, measureId) {
    const intMeasureId = parseInt(measureId, 10);
    if (!isFinite(intMeasureId)) return Promise.reject(new Error(`Invalid measure ID: ${measureId}`));

    return this.fetch(`/biota/otolith/${intMeasureId}/detail`).then((od) => {
      return {
        slideLabel: [
          od.sampleResponse.sampleId,
            `${od.sampleResponse.station.cruise.name}/${od.sampleResponse.station.number}`,
            od.speciesDTO.id,
            (new Date(od.sampleResponse.station.stationDate)).getMonth() + 1
        ].join(' '),
        length: od.measureDTO.length,
        sex: od.measureDTO.sexNo,
        maturity: od.measureDTO.sexualMaturity.sexualMaturityId,
        species: od.speciesDTO.name,

        cruise: od.sampleResponse.station.cruise.name,
        station: od.sampleResponse.station.number,
        gear: od.sampleResponse.gear.isscfgNo,
        meshSize: od.sampleResponse.meshSize
      };
    });
  }
}
