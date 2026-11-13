from django.contrib.auth import authenticate

from ..errors import json_unauthorized


class ApiTokenMiddleware:
    """Authenticate requests with an "Authorization: Token <key>" header.

    Modelled on Django's RemoteUserMiddleware, this must come after
    AuthenticationMiddleware in MIDDLEWARE. No session is created, the token
    has to be provided with every request.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        scheme, _, key = request.META.get("HTTP_AUTHORIZATION", "").partition(" ")
        if scheme.lower() != "token":
            return self.get_response(request)

        user = authenticate(request, token=key.strip())
        if user is None:
            return json_unauthorized("Invalid API token")
        request.user = user
        # NB: CSRF only protects cookie-based sessions, a header can't be forged cross-site.
        #     Don't make API views @csrf_exempt, that would disable checks for sessions too.
        request._dont_enforce_csrf_checks = True
        return self.get_response(request)
