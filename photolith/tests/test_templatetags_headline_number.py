from django.test import TestCase

from ..templatetags.headline_number import headline_number, TAG_START, TAG_END

repl = dict(START="<em>", END="</em>", S=TAG_START, E=TAG_END)


class RandomPrefixTestCase(TestCase):
    def test_headline_number(self):
        self.assertEqual(headline_number(123), "{START}{S}123{E}{END}".format(**repl))
        self.assertEqual(
            headline_number(123456789),
            "{START}{S}123{E}{S}456{E}{S}789{E}{END}".format(**repl),
        )
        self.assertEqual(
            headline_number(123456789.123),
            "{START}{S}123{E}{S}456{E}{S}789.123{E}{END}".format(**repl),
        )
        self.assertEqual(
            headline_number(1e8),
            "{START}{S}100{E}{S}000{E}{S}000.0{E}{END}".format(**repl),
        )
