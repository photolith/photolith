from django.core import mail
from django.test import RequestFactory, TestCase

from ..admin import *

from .requires_utils import RequiresUtils


class UserActivateTest(RequiresUtils, TestCase):
    def test_user_activate(self):
        def ua(users_to_reset):
            mail.outbox.clear()
            user_activate(
                None,
                RequestFactory().get("/admin", {}),
                User.objects.filter(pk__in=[u.id for u in users_to_reset]),
            )
            return [m.body.split("\n") for m in mail.outbox]

        users = [self.create_user(is_active=False) for _ in range(4)]

        # Single user
        forgottens = [
            [x for x in body if ("forgotten" in x)][0] for body in ua([users[0]])
        ]
        self.assertEqual(
            forgottens,
            [
                "Your username, in case you’ve forgotten: %s" % users[0].username,
            ],
        )
        for u in users:
            u.refresh_from_db()
        self.assertEqual(users[0].is_active, True)
        self.assertEqual(users[1].is_active, False)
        self.assertEqual(users[2].is_active, False)
        self.assertEqual(users[3].is_active, False)

        # Multiple
        forgottens = [
            [x for x in body if ("forgotten" in x)][0] for body in ua(users[0:3])
        ]
        self.assertEqual(
            forgottens,
            [
                "Your username, in case you’ve forgotten: %s" % users[0].username,
                "Your username, in case you’ve forgotten: %s" % users[1].username,
                "Your username, in case you’ve forgotten: %s" % users[2].username,
            ],
        )
        for u in users:
            u.refresh_from_db()
        self.assertEqual(users[0].is_active, True)
        self.assertEqual(users[1].is_active, True)
        self.assertEqual(users[2].is_active, True)
        self.assertEqual(users[3].is_active, False)
