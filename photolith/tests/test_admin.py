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


class IndividualAdminTest(RequiresUtils, TestCase):
    def test_data(self):
        ind = self.create_individual(
            data=dict(ch_slideLabel="<script>alert(1)</script>", nm_length=4.5)
        )
        ia = IndividualAdmin(Individual, admin.site)

        out = ia.data(ind)
        self.assertNotIn("<script>", out)
        self.assertIn(
            "<td>ch_slideLabel</td><td>&lt;script&gt;alert(1)&lt;/script&gt;</td>", out
        )
        self.assertIn("<td>nm_length</td><td>4.5</td></tr><tr>", out)

    def test_image_preview(self):
        ind = self.create_individual(
            bounding_box=[[0, 0], ["</script><script>alert(1)</script>", "'"]]
        )
        ia = IndividualAdmin(Individual, admin.site)

        out = ia.image_preview(ind)
        # Only our own script tag is present
        self.assertEqual(out.count("<script>"), 1)
        self.assertEqual(out.count("</script>"), 1)
        self.assertIn("\\u003C/script\\u003E", out)
