from django.template import Context, Template
from django.test import TestCase

from ..templatetags.tojson import tojson


class ToJsonTestCase(TestCase):
    def test_tojson(self):
        self.assertEqual(tojson([[1, 2], [3.5, 4]]), "[[1, 2], [3.5, 4]]")
        self.assertEqual(tojson([[1, 2, "C"]]), '[[1, 2, "C"]]')
        self.assertEqual(tojson(None), "null")

    def test_tojson_attribute(self):
        """Autoescaped when used in a template, so safe in an attribute"""
        out = Template('{% load tojson %}<span data-x="{{ v|tojson }}"></span>').render(
            Context(dict(v=[[1, 2, 'C"<']]))
        )
        self.assertEqual(
            out, '<span data-x="[[1, 2, &quot;C\\&quot;&lt;&quot;]]"></span>'
        )
