import functools
import logging


from django.core.exceptions import BadRequest, PermissionDenied, ValidationError
from django.http import Http404, JsonResponse

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
                if isinstance(e, (BadRequest, ValidationError)):
                    status = 400
                elif isinstance(e, PermissionDenied):
                    status = 403
                elif isinstance(e, Http404):
                    status = 404
                else:
                    status = 500
            return JsonResponse(
                dict(
                    error_class=e.__class__.__name__,
                    error=getattr(e, "message", str(e)),
                ),
                status=status,
            )

    return wrapper


def json_unauthorized(error):
    """401 response, in the same shape as json_errors"""
    return JsonResponse(
        dict(error_class="Unauthorized", error=error),
        status=401,
        headers={"WWW-Authenticate": "Token"},
    )
