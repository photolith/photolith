import json

from django.core.exceptions import PermissionDenied, ValidationError
from django.http import Http404
from django.test import TestCase

from ..errors import Conflict, PreconditionFailed, json_errors


class JsonErrorsTest(TestCase):
    def call(self, e):
        def view(request):
            raise e

        with self.assertLogs("photolith.errors", level="ERROR"):
            resp = json_errors(view)(None)
        return resp.status_code, json.loads(resp.content)

    def test_status(self):
        # Explicit HTTP status
        self.assertEqual(
            self.call(ValidationError("Missing", code=400)),
            (400, dict(error_class="ValidationError", error="Missing")),
        )
        # Django validation errors, with no / non-HTTP codes
        self.assertEqual(
            self.call(ValidationError("Bad date", code="invalid")),
            (400, dict(error_class="ValidationError", error="Bad date")),
        )
        self.assertEqual(
            self.call(ValidationError("Bad")),
            (400, dict(error_class="ValidationError", error="Bad")),
        )
        # Permissions / not found
        self.assertEqual(
            self.call(PermissionDenied("No")),
            (403, dict(error_class="PermissionDenied", error="No")),
        )
        self.assertEqual(
            self.call(Http404("Where")),
            (404, dict(error_class="Http404", error="Where")),
        )
        # Anything else
        self.assertEqual(
            self.call(PermissionError("No")),
            (500, dict(error_class="PermissionError", error="No")),
        )
        self.assertEqual(
            self.call(KeyError("x")),
            (500, dict(error_class="KeyError", error="'x'")),
        )

    def test_json_data(self):
        self.assertEqual(
            self.call(Conflict("2 things", things=dict(x=[1, 2]))),
            (
                409,
                dict(error_class="Conflict", error="2 things", things=dict(x=[1, 2])),
            ),
        )
        self.assertEqual(
            self.call(PreconditionFailed("Changed")),
            (412, dict(error_class="PreconditionFailed", error="Changed")),
        )
