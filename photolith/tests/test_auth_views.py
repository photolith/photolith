from django.contrib.auth.models import User

from django.test import Client, TestCase
from .requires_utils import RequiresUtils


class AnnotateViewTest(RequiresUtils, TestCase):
    def form_post(self, **kwargs):
        client = Client()
        resp = client.post("/accounts/signup/", kwargs)
        if resp.status_code == 302:
            return (302, resp.url)
        if resp.status_code == 200:
            return (200, resp.content.decode("utf-8"))
        raise ValueError(resp.status_code)

    def test_no_password_fields(self):
        """Form has password fields removed"""
        client = Client()
        resp = client.get("/accounts/signup/")
        self.assertFalse(b"password1" in resp.content)
        self.assertFalse(b"password2" in resp.content)

    def test_post(self):
        out = self.form_post(
            username="bob",
            first_name="Bob",
            last_name="Geldof",
            email="bob@example.com",
        )
        self.assertEqual(out, (302, "/accounts/signup/done"))
        u = User.objects.get(username="bob")
        self.assertEqual(u.first_name, "Bob")
        self.assertEqual(u.last_name, "Geldof")
        self.assertEqual(u.email, "bob@example.com")
        self.assertEqual(u.is_active, False)

        # Can't recreate bob
        out = self.form_post(
            username="bob",
            first_name="Fran",
            last_name="Geldof",
            email="bob@example.com",
        )
        self.assertEqual(out[0], 200)
        self.assertTrue("A user with that username already exists" in out[1])
        u = User.objects.get(username="bob")
        self.assertEqual(u.first_name, "Bob")
