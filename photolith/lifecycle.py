"""Server-side copies of client/src/lifecycle.js functions. NB: Keep these in sync, test_lifecycle.py checks they match"""

import math
import re

from .models import MetaTx


def age_stages_anadromous(axis_poly):
    """
    For a set of axis_poly points, count years in each stage as dict(F, S, G), or
    dict(F, G) if the fish never went to sea (no S labels), as ageStagesAnadromous()
    """
    labels = [p[2] for p in axis_poly if len(p) > 2 and p[2]]

    def count(stage):
        return sum(1 for x in labels if x[0] == stage and x != stage + "+")

    if any(x[0] == "S" for x in labels):
        return dict(F=count("F"), S=count("S"), G=count("G"))
    return dict(F=count("F"), G=count("G"))


def point_labels(axis_poly):
    """
    Label for each point of (axis_poly) after the centre. Unlabelled points fall back to
    labelOptionsDefault()'s numbering, i.e. 1..n then E for the end
    """
    return [
        p[2] if len(p) > 2 and p[2] else "E" if i == len(axis_poly) - 1 else str(i)
        for i, p in enumerate(axis_poly)
        if i > 0
    ]


def label_sort_key(label):
    """Sort key for labels of any lifecycle, i.e. F1..Fn, F+, S1..Sn, S+, G1..Gn, 1..n, E, then anything else"""
    m = re.fullmatch(r"([FSG]?)(\d+|\+)", label)
    if m:
        stage, n = m.groups()
        return (
            "FSG".index(stage) if stage else 3,
            float("inf") if n == "+" else int(n),
            label,
        )
    return (3 if label == "E" else 4, float("inf"), label)


# tx_lifecycle id -> ageStages function, anything not here has no stages
AGE_STAGES = {
    1: age_stages_anadromous,
}


def age_stages_individual_ids():
    """Subquery of ids of individuals whose tx_lifecycle has age stages"""
    return MetaTx.objects.filter(
        key="lifecycle", value__identifier__in=AGE_STAGES.keys()
    ).values("individual_id")


def age_stages(ind_data, axis_poly):
    """Break down the age of (axis_poly) by stage, using lifecycle in (ind_data), or None if it has no stages"""
    fn = AGE_STAGES.get((ind_data.get("tx_lifecycle") or {}).get("id"))
    return fn(axis_poly) if fn else None


def back_calc_dahl_lea(axis_poly, ind_data):
    """
    Dahl-Lea, length = nm_length * radius to mark / total radius, with radii as the straight line from the
    centre to each point, as backCalcDahlLea(). None if there's no length, Nones if there's no scale radius
    """
    fish_length = ind_data.get("nm_length")
    if not fish_length:
        return None
    # NB: Not math.hypot(), so we get the same floats as lifecycle.js
    radii = [
        math.sqrt((p[0] - axis_poly[0][0]) ** 2 + (p[1] - axis_poly[0][1]) ** 2)
        for p in axis_poly
    ]
    total = radii[-1] if radii else 0
    if not total:
        return [None for r in radii]
    return [fish_length * r / total for r in radii]


# tx_sampleType id -> back-calculation function, anything not here has no back-calculation
BACK_CALCS = {
    2: back_calc_dahl_lea,  # Scale
}


def back_calc_individual_ids():
    """Subquery of ids of individuals whose tx_sampleType has a back-calculation"""
    return MetaTx.objects.filter(
        key="sampleType", value__identifier__in=BACK_CALCS.keys()
    ).values("individual_id")


def back_calc(ind_data, axis_poly):
    """Length at each point of (axis_poly), using tx_sampleType in (ind_data), or None if there's no back-calculation"""
    fn = BACK_CALCS.get((ind_data.get("tx_sampleType") or {}).get("id"))
    return fn(axis_poly, ind_data) if fn else None
