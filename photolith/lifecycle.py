"""Server-side copies of client/src/lifecycle.js functions. NB: Keep these in sync, test_lifecycle.py checks they match"""

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
