from django import template

register = template.Library()


@register.filter
def verbose_name(value, arg):
    value = value._meta
    if arg:
        value = value.get_field(arg)
    return value.verbose_name
