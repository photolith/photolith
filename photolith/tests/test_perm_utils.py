from django.core.exceptions import PermissionDenied
from django.test import TestCase

from ..perm_utils import check_annotate_access

from .requires_utils import RequiresUtils


class CheckAnnotateAccessTest(RequiresUtils, TestCase):
    def test_project(self):
        owner = self.create_user()
        member = self.create_user()
        other = self.create_user()
        p = self.create_project(team=[member], created_by=owner)

        check_annotate_access(p, owner, rw=True)
        check_annotate_access(p, member, rw=True)
        with self.assertRaisesRegex(PermissionDenied, "added to this project"):
            check_annotate_access(p, other)

        # Team deleted, owner still has access, nobody else
        p.team.delete()
        p.refresh_from_db()
        self.assertEqual(p.team, None)
        check_annotate_access(p, owner, rw=True)
        with self.assertRaisesRegex(PermissionDenied, "added to this project"):
            check_annotate_access(p, member)
