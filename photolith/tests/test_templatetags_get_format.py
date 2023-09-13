from django.utils import formats
from django.test import TestCase

from ..templatetags.get_format import get_format


class GetFormatTestCase(TestCase):
    def test_get_format(self):
        self.assertEqual(
            get_format("THOUSAND_SEPARATOR"),
            formats.get_format("THOUSAND_SEPARATOR"),
        )
