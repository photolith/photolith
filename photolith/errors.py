import functools
import logging


from django.core.exceptions import ValidationError
from django.http import JsonResponse

logger = logging.getLogger(__name__)


def json_errors(func):
    @functools.wraps(func)
    def wrapper(request, *args, **kwargs):
        try:
            return func(request, *args, **kwargs)
        except Exception as e:
            logger.exception(e)
            # NB: code is e.g. "invalid" for Django's own ValidationErrors, only use HTTP status codes
            status = getattr(e, "code", None)
            if not (isinstance(status, int) and 400 <= status < 600):
                status = 400 if isinstance(e, ValidationError) else 500
            return JsonResponse(
                dict(
                    error_class=e.__class__.__name__,
                    error=getattr(e, "message", str(e)),
                ),
                status=status,
            )

    return wrapper
