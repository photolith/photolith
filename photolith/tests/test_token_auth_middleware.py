import json

from django.contrib.auth.models import AnonymousUser
from django.http import HttpResponse
from django.test import Client, RequestFactory, TestCase

from ..token_auth.middleware import ApiTokenMiddleware
from ..token_auth.models import ApiToken

from .binaries import JPEG_VALID
from .requires_utils import RequiresUtils


class ApiTokenMiddlewareTest(RequiresUtils, TestCase):
    def create_token(self, user):
        token = ApiToken(user=user, name="UT token")
        key = token.generate_key()
        token.save()
        return token, key

    def do_atm(self, user=None, **headers):
        """Call middleware, return (status, response text, request user, CSRF disabled)"""
        seen = {}

        def mock_get_response(request):
            seen["user"] = request.user
            seen["csrf_off"] = getattr(request, "_dont_enforce_csrf_checks", False)
            return HttpResponse("Regular response")

        request = RequestFactory().get("/", headers=headers)
        # NB: As set by AuthenticationMiddleware
        request.user = user or AnonymousUser()
        resp = ApiTokenMiddleware(mock_get_response)(request)
        if resp.status_code == 401:
            self.assertEqual(resp["WWW-Authenticate"], "Token")
            return resp.status_code, json.loads(resp.content), None, None
        return resp.status_code, resp.text, seen["user"], seen["csrf_off"]

    def test_authenticate(self):
        user = self.create_user()
        token, key = self.create_token(user)
        self.assertEqual(token.last_used_at, None)

        # No header / other schemes are left alone
        for headers in [dict(), dict(Authorization="Bearer %s" % key)]:
            self.assertEqual(
                self.do_atm(**headers),
                (200, "Regular response", AnonymousUser(), False),
            )

        # Valid token authenticates as user, scheme is case-insensitive
        for auth in ["Token %s" % key, "token %s" % key, "Token  %s " % key]:
            self.assertEqual(
                self.do_atm(Authorization=auth),
                (200, "Regular response", user, True),
            )
        token.refresh_from_db()
        self.assertNotEqual(token.last_used_at, None)

        # Unknown / empty tokens are rejected, not treated as anonymous
        for auth in ["Token not-a-key", "Token", "Token %s" % key[:-1]]:
            self.assertEqual(
                self.do_atm(Authorization=auth),
                (
                    401,
                    dict(error_class="Unauthorized", error="Invalid API token"),
                    None,
                    None,
                ),
            )

        # A token takes precedence over a session
        other_user = self.create_user()
        self.assertEqual(self.do_atm(other_user)[2], other_user)
        self.assertEqual(
            self.do_atm(other_user, Authorization="Token %s" % key)[2], user
        )

        # Inactive users' tokens don't work
        user.is_active = False
        user.save()
        self.assertEqual(self.do_atm(Authorization="Token %s" % key)[0], 401)

        # Deleting the token stops it working
        user.is_active = True
        user.save()
        self.assertEqual(self.do_atm(Authorization="Token %s" % key)[0], 200)
        token.delete()
        self.assertEqual(self.do_atm(Authorization="Token %s" % key)[0], 401)

    def test_no_session(self):
        user = self.create_user(groups=["Ingest"])
        token, key = self.create_token(user)

        # Token authentication doesn't create a session
        client = Client()
        resp = client.get("/ingest/", headers=dict(Authorization="Token %s" % key))
        self.assertEqual(resp.status_code, 200)
        self.assertNotIn("sessionid", client.cookies)
        resp = client.get("/ingest/")
        self.assertEqual(resp.status_code, 302)

    def test_csrf(self):
        user = self.create_user(groups=["Ingest"])
        token, key = self.create_token(user)

        def upload(client, **headers):
            return client.post(
                "/ingest/upload-image/",
                JPEG_VALID,
                content_type="image/jpeg",
                headers=dict(X_Photolith_Filename="a.jpg", **headers),
            ).status_code

        # Session authentication still requires a CSRF token
        client = Client(enforce_csrf_checks=True)
        client.force_login(user)
        self.assertEqual(upload(client), 403)

        # Token authentication doesn't
        client = Client(enforce_csrf_checks=True)
        self.assertEqual(upload(client, Authorization="Token %s" % key), 200)
