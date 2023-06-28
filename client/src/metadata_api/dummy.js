const species = [
  { id: 1, en: 'Cod [COD]', is: 'Þorskur [COD]' },
  { id: 2, en: 'Greenland Halibut [GLH]', is: 'Grálúða [GLH]' }
];

const sex = [
  { id: 1, en: 'Male [M]', is: 'Karlkyns [M]' },
  { id: 2, en: 'Female [F]', is: 'Kvenkyns [F]' },
  { id: 3, en: 'Mixed [X]', is: 'Blandað [X]' },
  { id: 4, en: 'Indeterminate [N]', is: 'Óákveðið [N]' },
  { id: 4, en: 'Unknown [U]', is: 'Óþekktur [U]' }
];

const maturity = [
  { id: 1, en: 'Immature', is: 'Óþroskaður' },
  { id: 5, en: 'Mature', is: 'Þroskaður' }
];

function randomChoice (ar) {
  return ar[Math.floor(Math.random() * ar.length)];
}

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
        sex: randomChoice(sex),
        maturity: randomChoice(maturity),
        species: randomChoice(species)
      };
    });
  }
}
