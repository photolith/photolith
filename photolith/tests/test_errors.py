import json

from django.core.exceptions import PermissionDenied, ValidationError
from django.test import TestCase

from ..errors import json_errors


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
        # Anything else
        self.assertEqual(
            self.call(PermissionDenied("No")),
            (500, dict(error_class="PermissionDenied", error="No")),
        )
        self.assertEqual(
            self.call(KeyError("x")),
            (500, dict(error_class="KeyError", error="'x'")),
        )
