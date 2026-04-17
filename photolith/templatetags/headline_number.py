from django import template
from django.utils.safestring import mark_safe

register = template.Library()

TAG_START = '<code class="fs-5 me-1">'
TAG_END = "</code>"


@register.filter
def headline_number(val):
    return mark_safe(
        "".join(
            (
                "<em>",
                TAG_START,
                "{:,}".format(val).replace(",", TAG_END + TAG_START),
                TAG_END,
                "</em>",
            )
        )
    )
