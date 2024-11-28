from django.utils.translation import gettext as _
from django.test import TestCase

from ..models import Annotation
from ..templatetags.verbose_name import verbose_name


class VerboseNameTestCase(TestCase):
    def test_verbose_name(self):
        self.assertEqual(verbose_name(Annotation, None), "Annotation")
        self.assertEqual(verbose_name(Annotation, "age"), _("Age reading"))
