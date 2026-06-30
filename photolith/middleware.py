from django.http import HttpResponse


class EcsHealthCheckMiddleware:
    """Return 200 for ECS health checks at /health/.

    This middleware must be first in MIDDLEWARE so it intercepts the request
    before CommonMiddleware calls get_host(), which would raise DisallowedHost
    when the ECS health check arrives with the container's internal IP as the
    HTTP Host header.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.method == "GET" and request.path == "/health/":
            return HttpResponse("OK")
        return self.get_response(request)
