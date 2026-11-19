import functools
import logging


from django.core.exceptions import BadRequest, PermissionDenied, ValidationError
from django.http import Http404, JsonResponse

logger = logging.getLogger(__name__)


class Conflict(Exception):
    """Request conflicts with current state, json_data is added to the response"""

    code = 409

    def __init__(self, message, **json_data):
        super().__init__(message)
        self.message = message
        self.json_data = json_data


class PreconditionFailed(Exception):
    """An If-Match (or similar) header didn't match"""

    code = 412


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
            out = dict(
                error_class=e.__class__.__name__,
                error=getattr(e, "message", str(e)),
            )
            if isinstance(e, ValidationError) and hasattr(e, "error_dict"):
                # Errors for individual fields, e.g. from a form
                out["error"] = " ".join(e.messages)
                out["fields"] = e.message_dict
            out.update(getattr(e, "json_data", {}))
            return JsonResponse(out, status=status)

    return wrapper


def json_unauthorized(error):
    """401 response, in the same shape as json_errors"""
    return JsonResponse(
        dict(error_class="Unauthorized", error=error),
        status=401,
        headers={"WWW-Authenticate": "Token"},
    )
