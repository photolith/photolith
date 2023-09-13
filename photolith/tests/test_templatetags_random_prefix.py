from django.test import TestCase

from ..templatetags.random_prefix import random_prefix


class RandomPrefixTestCase(TestCase):
    def test_random_prefix(self):
        self.assertTrue(random_prefix("thingy").startswith("thingy-"))
        self.assertEqual(len(random_prefix("thingy")), len("thingy-") + 10)
        self.assertNotEqual(random_prefix("thingy"), random_prefix("thingy"))
