import io

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase

from ..models import ApiToken

from .requires_utils import RequiresUtils


class CreateApiTokenTest(RequiresUtils, TestCase):
    def test_handle(self):
        user = self.create_user()

        out = io.StringIO()
        call_command(
            "create_api_token", user.username, "--name", "UT script", stdout=out
        )
        key = out.getvalue().strip()
        token = ApiToken.objects.get(user=user)
        self.assertEqual(token.name, "UT script")
        self.assertEqual(token.key_hash, ApiToken.hash_key(key))

        with self.assertRaisesRegex(CommandError, "Unknown user"):
            call_command("create_api_token", "not-a-user", stdout=io.StringIO())
