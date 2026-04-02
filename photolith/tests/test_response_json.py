import json

from django.test import TestCase

from ..response_json import StreamingJsonResponse


class ExportViewTest(TestCase):
    def do_sjr(self, streaming_content):
        sjr = StreamingJsonResponse(streaming_content)
        self.assertEqual(sjr.headers["Content-Type"], "application/json")
        return json.loads(b"".join(sjr.streaming_content))

    def test_success(self):
        self.assertEqual(self.do_sjr(range(5)), dict(data=[0, 1, 2, 3, 4]))
        self.assertEqual(
            self.do_sjr([{"1": "One potato"}, {"2": "ორი კარტოფილი"}]),
            dict(data=[{"1": "One potato"}, {"2": "ორი კარტოფილი"}]),
        )

    def test_success_empty(self):
        def stuff():
            pass

        self.assertEqual(self.do_sjr(stuff()), dict(data=[]))

    def test_error_preflight(self):
        def stuff():
            raise ValueError("Three!")
            yield "One potato"
            yield "Two potato"

        self.assertEqual(
            self.do_sjr(stuff()),
            dict(
                error_class="ValueError",
                error="Three!",
            ),
        )

    def test_error_midflight(self):
        def stuff():
            yield "One potato"
            yield "Two potato"
            raise ValueError("Three!")

        self.assertEqual(
            self.do_sjr(stuff()),
            dict(
                data=["One potato", "Two potato"],
                error_class="ValueError",
                error="Three!",
            ),
        )
