// For a set of axis_poly points, generate all possible values for the next
function labelOptionsAnadromous (points) {
  let curStage = 'F';
  let curCount = 1;
  return points.map((p, i) => {
    // Centre never has a label
    if (i === 0) return [null];

    const nextStage = curStage + curCount;

    if (curStage === 'F') {
      if (p[2] === 'F+') {
        curStage = 'S';
        curCount = 1;
        return ['F+', nextStage];
      }
      curCount += 1;
      return [nextStage, 'F+'];
    }

    if (curStage === 'S') {
      if (p[2] === 'S+') {
        curStage = 'G';
        curCount = 1;
        return ['S+', nextStage];
      }
      curCount += 1;
      return [nextStage, 'S+'];
    }

    // curStage === 'G'
    curCount += 1;
    return [nextStage];
  });
}

// For a set of points, count everything apart from the centre & plus-growth (F+ / S+) points as the age
function ageAnadromous (points) {
  return points.filter((p, i) => i > 0 && p[2] !== 'F+' && p[2] !== 'S+').length;
}

// For a set of axis_poly points, generate all possible values for the next, as labelOptionsAnadromous without sea (S) years
function labelOptionsFreshwater (points) {
  let curStage = 'F';
  let curCount = 1;
  return points.map((p, i) => {
    // Centre never has a label
    if (i === 0) return [null];

    const nextStage = curStage + curCount;

    if (curStage === 'F') {
      if (p[2] === 'F+') {
        curStage = 'G';
        curCount = 1;
        return ['F+', nextStage];
      }
      curCount += 1;
      return [nextStage, 'F+'];
    }

    // curStage === 'G'
    curCount += 1;
    return [nextStage];
  });
}

// For a set of axis_poly points, number each point, or E for the end
function labelOptionsDefault (points) {
  return points.map((p, i) => {
    // Centre never has a label
    if (i === 0) return [null];

    return [i === points.length - 1 ? 'E' : String(i)];
  });
}

// For a set of points, count ring markers (i.e. all points apart from the centre & end) as the age
function ageDefault (points) {
  return Math.max(points.length - 2, 0);
}

// Photolith tx_lifecycle. NB: Ids are our own, other users (e.g. photolith_import's mei.py) should copy these
export const txLifecycle = [
  { id: 1, en: 'Freshwater', is: 'Staðbundinn' },
  { id: 2, en: 'Anadromous', is: 'Sjógenginn' }
];

const lifecycleDefault = { labelOptions: labelOptionsDefault, age: ageDefault };

// tx_lifecycle id -> lifecycle, anything not here uses lifecycleDefault
const lifecycles = {
  1: { labelOptions: labelOptionsFreshwater, age: ageAnadromous },
  2: { labelOptions: labelOptionsAnadromous, age: ageAnadromous }
};

/**
 * Lifecycle for an individual's (indData), an object containing:
 * - labelOptions(points): Turn a list of axis_poly points into a list of possible labels for each point
 * - age(points): Calculate age from a list of axis_poly points, i.e. [x, y] or [x, y, label]
 */
export function getLifecycle (indData) {
  return lifecycles[indData.tx_lifecycle?.id] || lifecycleDefault;
}
