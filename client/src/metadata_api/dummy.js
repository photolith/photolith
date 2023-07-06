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

function randomChoice (ar) {
  return ar[Math.floor(Math.random() * ar.length)];
}

export default class MetadataApi {
  metaLabels (lang) {
    return metaLabels[lang] || metaLabels.en;
  }

  sampleDetail (sampleId) {
    const intSampleId = parseInt(sampleId, 10);
    if (!isFinite(intSampleId)) return Promise.reject(new Error(`Invalid sample ID: ${sampleId}`));

    return Promise.resolve(Array.from(Array(20))).then((measures) => {
      return {
        individuals: measures.map((_, i) => ({
          id: (sampleId * 100 + i).toString(),
          title: i.toString(),
          slideLabel: [
            sampleId,
            'TB2-2021/95',
            '10'
          ].join(' '),
          length: Math.floor(Math.random() * 100),
          sex: randomChoice(sex),
          maturity: randomChoice(maturity),
          species: randomChoice(species),
          cruise: 'TB2-2021',
          station: '95',
          stationDate: '2021-10-23T00:00:00Z',
          gear: '0312',
          meshSize: 40
        }))
      };
    });
  }
}
