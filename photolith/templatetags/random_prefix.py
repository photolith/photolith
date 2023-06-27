import random
import string

from django import template


register = template.Library()


@register.simple_tag
def random_prefix(prefix):
    return (
        prefix
        + "-"
        + "".join(random.choices(string.ascii_uppercase + string.digits, k=10))
    )
