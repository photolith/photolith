from django.test import TestCase

from ..token_auth.models import ApiToken

from .requires_utils import RequiresUtils


class ApiTokenTest(RequiresUtils, TestCase):
    def test_generate_key(self):
        user = self.create_user()
        token = ApiToken(user=user, name="UT token")
        key = token.generate_key()
        token.save()

        # Only the hash is stored
        self.assertEqual(token.key_hash, ApiToken.hash_key(key))
        self.assertNotIn(key, token.key_hash)
        self.assertEqual(len(token.key_hash), 64)

        # Keys are unique
        self.assertNotEqual(token.generate_key(), key)
