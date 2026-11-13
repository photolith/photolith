from django.http import HttpRequest, HttpResponse
from django.test import Client, TestCase, override_settings

from ..middleware import EcsHealthCheckMiddleware


class EcsHealthCheckMiddlewareTest(TestCase):
    def do_ehcm(self, method="GET", path="/"):
        def mock_get_response(request):
            return HttpResponse(
                "Regular response: %s %s"
                % (
                    request.method,
                    request.path,
                )
            )

        request = HttpRequest()
        request.method = method
        request.path = path
        ehcm = EcsHealthCheckMiddleware(mock_get_response)(request)

        self.assertEqual(ehcm.status_code, 200)
        return ehcm.text

    def test_call(self):
        self.assertEqual(
            self.do_ehcm(),
            "Regular response: GET /",
        )

        self.assertEqual(
            self.do_ehcm(path="/health/"),
            "OK",
        )

        self.assertEqual(
            self.do_ehcm(method="POST", path="/health/"),
            "Regular response: POST /health/",
        )

    @override_settings(ALLOWED_HOSTS=["example.com"], DEBUG=False)
    def test_disallowed_host(self):
        """Health check short-circuits before CommonMiddleware.get_host() rejects the Host header.

        ECS sends health-check requests with the container's internal IP in the Host
        header, which is not in ALLOWED_HOSTS. The middleware must intercept /health/
        before Django's host validation runs, otherwise the health check fails.
        """
        client = Client()

        # Sanity check: a non-health request with a disallowed Host is rejected.
        response = client.get("/", HTTP_HOST="10.0.0.1")
        self.assertEqual(response.status_code, 400)

        # The health check succeeds despite the disallowed Host.
        response = client.get("/health/", HTTP_HOST="10.0.0.1")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content, b"OK")
