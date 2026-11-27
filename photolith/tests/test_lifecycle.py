import json
import math
import pathlib
import shutil
import subprocess
import unittest

from django.test import TestCase

from ..lifecycle import age_stages, back_calc, label_sort_key, point_labels

ANADROMOUS = dict(tx_lifecycle={"id": 1, "en": "Anadromous", "is": "Sjógenginn"})
OTOLITH = dict(tx_sampleType={"id": 1, "en": "Otolith"})
SCALE = dict(tx_sampleType={"id": 2, "en": "Scale"})
LIFECYCLE_JS = (
    pathlib.Path(__file__).resolve().parents[2] / "client" / "src" / "lifecycle.js"
)


def pts(labels):
    """Turn a list of labels into axis_poly points, None meaning no label, as test_lifecycle.js"""
    return [[i, i] if x is None else [i, i, x] for i, x in enumerate(labels)]


def js_lifecycle(cases, fn_body):
    """
    Run each (ind_data, axis_poly) in (cases) through (fn_body), JS with lc (getLifecycle(indData)),
    indData & points available, returning the results
    """
    script = """
        import fs from 'node:fs';
        import { getLifecycle } from %s;

        const cases = JSON.parse(fs.readFileSync(0, 'utf8'));
        console.log(JSON.stringify(cases.map(([indData, points]) => {
          const lc = getLifecycle(indData);
          %s
        })));
    """ % (json.dumps(LIFECYCLE_JS.as_uri()), fn_body)
    out = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        input=json.dumps(cases),
        capture_output=True,
        text=True,
        check=True,
    )
    return json.loads(out.stdout)


def js_age_stages(cases):
    """Run each (ind_data, axis_poly) in (cases) through lifecycle.js's ageStages(), None if the lifecycle has none"""
    return js_lifecycle(cases, "return lc.ageStages ? lc.ageStages(points) : null;")


def js_back_calc(cases):
    """Run each (ind_data, axis_poly) in (cases) through lifecycle.js's backCalc()"""
    return js_lifecycle(cases, "return lc.backCalc(points, indData);")


# (ind_data, labels, expected age_stages)
# NB: Anadromous are the same cases as lifecycleAnadromous:ageStages in test_lifecycle.js
CASES = [
    (dict(), [None, "1", "2", "E"], None),
    (dict(tx_lifecycle={"id": 99}), [None, "F1"], None),
    (dict(tx_lifecycle=None), [None, "F1"], None),
    (ANADROMOUS, [], dict(F=0, G=0)),
    (ANADROMOUS, [None, "F1", "F2", "F3", "F+"], dict(F=3, G=0)),
    (ANADROMOUS, [None, "F1", "F2", "G1", "F+"], dict(F=2, G=1)),
    (
        ANADROMOUS,
        [None, "F1", "F2", "F+", "S1", "G1", "G2", "S+"],
        dict(F=2, S=1, G=2),
    ),
    (ANADROMOUS, [None, "F1", "F+", "S+"], dict(F=1, S=0, G=0)),
    (ANADROMOUS, [None, "F1", "F+", "S1", "S+", None], dict(F=1, S=1, G=0)),
    (ANADROMOUS, [None, None, None], dict(F=0, G=0)),
    (ANADROMOUS, [None, "F+", "S+"], dict(F=0, S=0, G=0)),
    (
        ANADROMOUS,
        [None, "F1", "F2", "F3", "F4", "F+", "S1", "S2", "S+"],
        dict(F=4, S=2, G=0),
    ),
]


class AgeStagesTest(TestCase):
    def test_age_stages(self):
        for ind_data, labels, expected in CASES:
            self.assertEqual(age_stages(ind_data, pts(labels)), expected, labels)

    @unittest.skipUnless(shutil.which("node"), "node not installed")
    def test_age_stages__js_in_sync(self):
        """Python age_stages() gives the same results as lifecycle.js"""
        cases = [(ind_data, pts(labels)) for ind_data, labels, _ in CASES]
        self.assertEqual(
            [age_stages(ind_data, axis_poly) for ind_data, axis_poly in cases],
            js_age_stages(cases),
        )


# (ind_data, axis_poly, expected back_calc)
# NB: Scale cases are as backCalc:dahlLea in test_lifecycle.js
BACK_CALC_CASES = [
    (dict(nm_length=30), [[0, 0], [3, 4], [6, 8]], None),
    (dict(OTOLITH, nm_length=30), [[0, 0], [3, 4], [6, 8]], None),
    (dict(tx_sampleType={}, nm_length=30), [[0, 0], [3, 4], [6, 8]], None),
    (SCALE, [[0, 0], [3, 4], [6, 8]], None),
    (dict(SCALE, nm_length=None), [[0, 0], [3, 4], [6, 8]], None),
    (dict(SCALE, nm_length=30), [[0, 0], [3, 4], [6, 8], [9, 12]], [0, 10, 20, 30]),
    (
        dict(SCALE, nm_length=10),
        [[0, 0], [3, 4, "F1"], [3, 9, "F+"]],
        [0, 10 * 5 / math.sqrt(90), 10],
    ),
    (dict(SCALE, nm_length=30), [[0, 0], [0, 0]], [None, None]),
    (dict(SCALE, nm_length=30), [], []),
]


class BackCalcTest(TestCase):
    def test_back_calc(self):
        for ind_data, axis_poly, expected in BACK_CALC_CASES:
            self.assertEqual(back_calc(ind_data, axis_poly), expected, axis_poly)

    @unittest.skipUnless(shutil.which("node"), "node not installed")
    def test_back_calc__js_in_sync(self):
        """Python back_calc() gives the same results as lifecycle.js"""
        cases = [(ind_data, axis_poly) for ind_data, axis_poly, _ in BACK_CALC_CASES]
        self.assertEqual(
            [back_calc(ind_data, axis_poly) for ind_data, axis_poly in cases],
            js_back_calc(cases),
        )


class PointLabelsTest(TestCase):
    def test_point_labels(self):
        self.assertEqual(point_labels(pts([])), [])
        self.assertEqual(point_labels(pts([None])), [])
        self.assertEqual(point_labels(pts([None, "1", "2", "E"])), ["1", "2", "E"])
        # Unlabelled points numbered as labelOptionsDefault
        self.assertEqual(point_labels(pts([None, None, None, None])), ["1", "2", "E"])
        self.assertEqual(
            point_labels(pts([None, "F1", "F+", "S1", "S+", None])),
            ["F1", "F+", "S1", "S+", "E"],
        )


class LabelSortKeyTest(TestCase):
    def test_label_sort_key(self):
        self.assertEqual(
            sorted(
                [
                    "S+",
                    "E",
                    "G2",
                    "F10",
                    "2",
                    "S1",
                    "F+",
                    "G1",
                    "10",
                    "F2",
                    "parp",
                    "S2",
                    "F1",
                    "1",
                ],
                key=label_sort_key,
            ),
            [
                "F1",
                "F2",
                "F10",
                "F+",
                "S1",
                "S2",
                "S+",
                "G1",
                "G2",
                "1",
                "2",
                "10",
                "E",
                "parp",
            ],
        )
