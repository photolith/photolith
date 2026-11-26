// For a set of axis_poly points, generate all possible values for the next.
// Readings go F1..Fn, F+, then optionally S1..Sn, S+ for fish that went to sea. Either the freshwater (F) or sea (S)
// years can be followed by spawning marks (gotmerki) G1..Gn before their plus-growth, e.g. "F1 F2 F+ S1 G1 S+".
// The reading of a fish that never went to sea ends at F+, e.g. "F1 F2 F3 F+".
// This matches Fishalysis .mei readings of salmon, trout & charr, both sea-run and freshwater
function labelOptionsAnadromous (points) {
  let baseStage = 'F'; // The stage we're in, or spawning marks are returning to
  let curStage = 'F';
  let curCount = 1;
  return points.map((p, i) => {
    // Centre never has a label
    if (i === 0) return [null];

    // S+ is the edge of the scale, nothing comes after it
    if (curStage === 'E') return [null];

    const nextStage = curStage + curCount;
    const plusStage = baseStage + '+';

    // Plus-growth moves on to sea years, or ends the reading
    if (p[2] === plusStage) {
      // Spawning marks need at least one year of their stage before them
      const options = [plusStage, nextStage, ...(curStage === baseStage && curCount > 1 ? ['G1'] : [])];
      baseStage = curStage = baseStage === 'F' ? 'S' : 'E';
      curCount = 1;
      return options;
    }

    if (curStage === baseStage) {
      if (curCount === 1) {
        curCount += 1;
        return [nextStage, plusStage];
      }
      if (p[2] === 'G1') {
        curStage = 'G';
        curCount = 2;
        return ['G1', nextStage, plusStage];
      }
      curCount += 1;
      return [nextStage, 'G1', plusStage];
    }

    // curStage === 'G'
    curCount += 1;
    return [nextStage, plusStage];
  });
}

// For a set of points, count every labelled point apart from plus-growth (F+ / S+) as the age
function ageAnadromous (points) {
  return points.filter((p) => p[2] && p[2] !== 'F+' && p[2] !== 'S+').length;
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

// Back-calculation of fish length at each mark on a scale, from an annotation's axis_poly points.
//
// Each backCalc function takes (points), an axis_poly i.e. [[x, y], [x, y, label], ...] starting at the centre & ending
// at the scale edge, and (indData), the individual's metadata. It returns the length at each point, in the units
// of indData.nm_length (the length at capture), i.e. 0 at the centre & nm_length at the edge, or nulls if there's
// no scale radius, or a single null if there's no length.
//
// Background:
// * ICES Atlantic salmon scale reading guidelines (Cooperative Research Report 188), radii are measured "from
//   the focus along the longest axis to the edge of the scale":
//   https://www.sfcc.co.uk/assets/files/Atlantic%20Salmon%20Scale%20Reading%20Guidelines.pdf
// * Overviews of back-calculation models (Dahl-Lea, Fraser-Lee, ...):
//   https://derekogle.com/IFAR/supplements/backcalculation.html
//   https://fishr-core-team.github.io/RFishBC/articles/BCIntro.html
//   https://www.michigandnr.com/publications/pdfs/ifr/manual/smii%20chapter09.pdf
// * Measuring along a curved growth axis instead of a straight line (for otoliths):
//   https://www.dfo-mpo.gc.ca/science/species-especes/otoliths/methods/interpretation-eng.html
//   https://spo.nmfs.noaa.gov/sites/default/files/pdf-content/2007/1052/roemer.pdf

function dist (a, b) {
  return Math.sqrt(Math.pow(b[0] - a[0], 2) + Math.pow(b[1] - a[1], 2));
}

// Dahl-Lea, length = nm_length * radius to mark / total radius, with radii as the straight line from the centre to each point
function backCalcDahlLea (points, indData) {
  const fishLength = indData.nm_length;
  if (!fishLength) return null;
  const radii = points.map((p) => dist(points[0], p));
  const total = radii[radii.length - 1];
  if (!total) return radii.map(() => null);
  return radii.map((r) => fishLength * r / total);
}

// No back-calculation, a single null instead of a length for each point
function backCalcDisabled (points, indData) {
  return null;
}

// tx_sampleType id -> back-calculation function, anything not here uses backCalcDisabled
const backCalcs = {
  2: backCalcDahlLea // Scale
};

// Photolith tx_lifecycle. NB: Ids are our own, other users (e.g. photolith_import's mei.py) should copy these
export const txLifecycle = [
  { id: 1, en: 'Anadromous', is: 'Sjógenginn' }
];

const lifecycleDefault = { labelOptions: labelOptionsDefault, age: ageDefault };

// tx_lifecycle id -> lifecycle, anything not here uses lifecycleDefault
const lifecycles = {
  1: { labelOptions: labelOptionsAnadromous, age: ageAnadromous }
};

/**
 * Lifecycle for an individual's (indData), an object containing:
 * - labelOptions(points): Turn a list of axis_poly points into a list of possible labels for each point
 * - age(points): Calculate age from a list of axis_poly points, i.e. [x, y] or [x, y, label]
 * - backCalc(points, indData): Turn a list of axis_poly points into a length for each point, see above, or null if disabled
 */
export function getLifecycle (indData) {
  return {
    ...(lifecycles[indData.tx_lifecycle?.id] || lifecycleDefault),
    backCalc: backCalcs[indData.tx_sampleType?.id] || backCalcDisabled
  };
}
