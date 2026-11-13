from django.test import Client, TestCase

from ..token_auth.models import ApiToken

from .requires_utils import RequiresUtils


class ApiTokenAdminTest(RequiresUtils, TestCase):
    def test_add(self):
        admin_user = self.create_user()
        admin_user.is_staff = admin_user.is_superuser = True
        admin_user.save()
        user = self.create_user()
        client = Client()
        client.force_login(admin_user)

        resp = client.post(
            "/admin/photolith/apitoken/add/",
            dict(user=user.id, name="Import script"),
            follow=True,
        )
        self.assertEqual(resp.status_code, 200)
        msgs = [str(m) for m in resp.context["messages"]]
        key = [m for m in msgs if m.startswith("API token key: ")][0].split(" ")[3]

        # Message has the key for the stored hash
        token = ApiToken.objects.get(user=user)
        self.assertEqual(token.name, "Import script")
        self.assertEqual(token.key_hash, ApiToken.hash_key(key))

        # Editing doesn't change the key, or the user
        resp = client.post(
            "/admin/photolith/apitoken/%d/change/" % token.id,
            dict(user=admin_user.id, name="Renamed script"),
            follow=True,
        )
        self.assertEqual(resp.status_code, 200)
        token.refresh_from_db()
        self.assertEqual(token.name, "Renamed script")
        self.assertEqual(token.user, user)
        self.assertEqual(token.key_hash, ApiToken.hash_key(key))
        self.assertFalse(
            any(str(m).startswith("API token key") for m in resp.context["messages"])
        )
