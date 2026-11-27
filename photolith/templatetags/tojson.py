import json

from django import template

register = template.Library()


@register.filter
def tojson(value):
    """
    value as JSON, e.g. for a data- attribute. NB: Not marked safe, so autoescaping
    applies, which suits attributes but not <script> contents (use json_script there)
    """
    return json.dumps(value)
