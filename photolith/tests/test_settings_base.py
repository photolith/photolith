import importlib
import unittest
import os


class SettingsBaseTest(unittest.TestCase):
    def do_settings(self, **environ):
        old_environ = dict()
        for k, v in environ.items():
            old_environ[k] = os.environ[k] if k in os.environ else None
            os.environ[k] = v
        try:
            if not getattr(self, "_m", None):
                self._m = importlib.import_module("photolith.settings.base")
            importlib.reload(self._m)
        finally:
            for k, old_v in old_environ.items():
                if old_v is None:
                    del os.environ[k]
                else:
                    os.environ[k] = old_v
        return self._m

    def test_amazon_ses(self):
        # Console is the default e-mail backend
        settings = self.do_settings()
        self.assertEqual(
            settings.EMAIL_BACKEND, "django.core.mail.backends.console.EmailBackend"
        )

        # Amazon SES variables are added to settings
        settings = self.do_settings(
            AWS_ACCESS_KEY_ID="123456789",
            AWS_SECRET_ACCESS_KEY="secret",
            AWS_SES_REGION_NAME="us-west-2",
            AWS_SES_REGION_ENDPOINT="email.us-west-2.amazonaws.com",
            APP_DEFAULT_FROM_EMAIL="admin@photolith.website.org",
            APP_SERVER_EMAIL="errors@photolith.website.org",
            AWS_SES_ACCESS_KEY_ID="YOUR-ACCESS-KEY-ID",
            AWS_SES_SECRET_ACCESS_KEY="YOUR-SECRET-ACCESS-KEY",
        )
        self.assertEqual(settings.EMAIL_BACKEND, "django_ses.SESBackend")
        self.assertEqual(settings.AWS_ACCESS_KEY_ID, "123456789")
        self.assertEqual(settings.AWS_SECRET_ACCESS_KEY, "secret")
        self.assertEqual(settings.AWS_SES_REGION_NAME, "us-west-2")
        self.assertEqual(
            settings.AWS_SES_REGION_ENDPOINT, "email.us-west-2.amazonaws.com"
        )
        self.assertEqual(settings.DEFAULT_FROM_EMAIL, "admin@photolith.website.org")
        self.assertEqual(settings.SERVER_EMAIL, "errors@photolith.website.org")
        self.assertEqual(settings.AWS_SES_ACCESS_KEY_ID, "YOUR-ACCESS-KEY-ID")
        self.assertEqual(settings.AWS_SES_SECRET_ACCESS_KEY, "YOUR-SECRET-ACCESS-KEY")
