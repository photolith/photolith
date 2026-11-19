from django.core.exceptions import PermissionDenied
from django.test import TestCase

from ..perm_utils import (
    check_annotate_access,
    check_annotation_edit_access,
)

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


class CheckAnnotationEditAccessTest(RequiresUtils, TestCase):
    def test_call(self):
        owner = self.create_user(groups=["General Annotation Editor"])
        other = self.create_user(groups=["General Annotation Editor"])
        su = self.create_user()
        su.is_superuser = True
        su.save()
        ind = self.create_individual()
        ann = self.create_annotation(ind, created_by=owner)

        # Owner or superuser
        check_annotation_edit_access(ann, owner)
        check_annotation_edit_access(ann, su)
        with self.assertRaisesRegex(PermissionDenied, "You do not own annotation"):
            check_annotation_edit_access(ann, other)

        # ...who can still annotate generally
        owner.groups.clear()
        owner = type(owner).objects.get(pk=owner.pk)  # NB: Forget cached permissions
        with self.assertRaisesRegex(PermissionDenied, "general annotation group"):
            check_annotation_edit_access(ann, owner)

    def test_project(self):
        member = self.create_user()
        ind = self.create_individual()
        p = self.create_project(team=[member], individuals=[ind])
        ann = self.create_annotation(ind, created_by=member, project=p)

        check_annotation_edit_access(ann, member)
        self.close_project(p)
        with self.assertRaisesRegex(PermissionDenied, "closed, cannot edit"):
            check_annotation_edit_access(ann, member)
