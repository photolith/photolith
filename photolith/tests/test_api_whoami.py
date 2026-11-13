from django.test import Client, TestCase

from ..models import UserSpeciesAuthority

from .requires_utils import RequiresUtils


class WhoAmIViewTest(RequiresUtils, TestCase):
    def whoami(self, user=None):
        client = Client()
        if user:
            client.force_login(user)
        resp = client.get("/api/v1/whoami/")
        return resp.status_code, resp.json()

    def test_get(self):
        # Anonymous users get a 401, not a login redirect
        self.assertEqual(
            self.whoami(),
            (401, dict(error_class="Unauthorized", error="Authentication required")),
        )

        # No profile, so default authority level
        user = self.create_user(groups=["Ingest"])
        status, out = self.whoami(user)
        self.assertEqual(status, 200)
        self.assertEqual(out["id"], user.id)
        self.assertEqual(out["username"], user.username)
        self.assertIn("photolith.add_image", out["permissions"])
        self.assertIn("photolith.add_individual", out["permissions"])
        self.assertEqual(out["permissions"], sorted(out["permissions"]))
        self.assertEqual(
            out["authority_level"], UserSpeciesAuthority.AuthorityLevel.INEXPERIENCED
        )

        # Base authority level from profile
        user = self.create_user(
            base_authority_level=UserSpeciesAuthority.AuthorityLevel.AUTOMATED
        )
        status, out = self.whoami(user)
        self.assertEqual(out["permissions"], [])
        self.assertEqual(
            out["authority_level"], UserSpeciesAuthority.AuthorityLevel.AUTOMATED
        )

    def test_method_not_allowed(self):
        client = Client()
        client.force_login(self.create_user())
        resp = client.post("/api/v1/whoami/")
        self.assertEqual(
            (resp.status_code, resp.json()),
            (
                405,
                dict(error_class="MethodNotAllowed", error="Method POST not allowed"),
            ),
        )
        self.assertEqual(resp["Allow"], "GET, HEAD, OPTIONS")
