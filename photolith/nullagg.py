# https://stackoverflow.com/a/65066965
from django.db.models import Func, CharField


class NullAgg(Func):
    """Annotation that causes GROUP BY without aggregating.

    A fake aggregate Func class that can be used in an annotation to cause
    a query to perform a GROUP BY without also performing an aggregate
    operation that would require the server to enumerate all rows in every
    group.

    Takes no constructor arguments and produces a value of NULL.

    Example:
        ContentType.objects.values('app_label').annotate(na=NullAgg())
    """

    template = "NULL"
    contains_aggregate = True
    window_compatible = False
    arity = 0
    output_field = CharField()
