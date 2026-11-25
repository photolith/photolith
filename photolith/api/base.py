import json

from django.core.exceptions import ValidationError
from django.http import JsonResponse
from django.views.generic import View

from ..errors import json_errors, json_unauthorized
from ..perm_utils import check_perms


class ApiView(View):
    """
    Base for API views:

    * Return 401 instead of redirecting to a login page
    * Check permission_required, as PermissionRequiredMixin
    * Return all errors as JSON, as json_errors, with 403 / 404 / 405 statuses
    """

    permission_required = ()

    def dispatch(self, request, *args, **kwargs):
        if not request.user.is_authenticated:
            return json_unauthorized("Authentication required")
        return json_errors(self._dispatch)(request, *args, **kwargs)

    def _dispatch(self, request, *args, **kwargs):
        check_perms(request.user, *self.permission_required)
        return super().dispatch(request, *args, **kwargs)

    def http_method_not_allowed(self, request, *args, **kwargs):
        """As View, but with a JSON body"""
        resp = super().http_method_not_allowed(request, *args, **kwargs)
        return JsonResponse(
            dict(
                error_class="MethodNotAllowed",
                error="Method %s not allowed" % request.method,
            ),
            status=resp.status_code,
            headers={"Allow": resp["Allow"]},
        )

    def json_body(self, allowed_keys):
        """Decode JSON object from the request body, with only allowed_keys"""
        try:
            out = json.loads(self.request.body)
        except ValueError as e:
            raise ValidationError("Invalid JSON: %s" % e, code=400)
        if not isinstance(out, dict):
            raise ValidationError("Expected a JSON object", code=400)
        unknown_keys = sorted(set(out.keys()) - set(allowed_keys))
        if unknown_keys:
            raise ValidationError(
                "Unknown keys: %s" % ", ".join(unknown_keys), code=400
            )
        return out
