export default class MetadataApi {
  sampleDetail (sampleId) {
    const intSampleId = parseInt(sampleId, 10);
    if (!isFinite(intSampleId)) return Promise.reject(new Error(`Invalid sample ID: ${sampleId}`));

    return Promise.resolve(Array.from(Array(20))).then((measures) => {
      return {
        individuals: measures.map((_, i) => ({
          id: sampleId * 100 + i,
          title: i
        }))
      };
    });
  }

  individualDetail (sampleId, measureId) {
    const intMeasureId = parseInt(measureId, 10);
    if (!isFinite(intMeasureId)) return Promise.reject(new Error(`Invalid measure ID: ${measureId}`));

    return Promise.resolve().then((od) => {
      return {
        slideLabel: [
          sampleId,
          measureId
        ].join(' '),
        length: Math.floor(Math.random() * 100),
        sex: Math.floor(Math.random() * 2),
        maturity: Math.floor(Math.random() * 2),
        species: 'COD'
      };
    });
  }
}
