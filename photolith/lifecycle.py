"""Server-side copies of client/src/lifecycle.js functions. NB: Keep these in sync, test_lifecycle.py checks they match"""

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
