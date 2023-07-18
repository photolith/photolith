from django import template
from django.utils import formats


register = template.Library()


@register.simple_tag
def get_format(name):
    return formats.get_format(name)
