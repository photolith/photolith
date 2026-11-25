import json

from django.test import Client, TestCase

from ..models import Annotation, UserSpeciesAuthority

from .requires_utils import RequiresUtils


class ApiAnnotationsTestBase(RequiresUtils, TestCase):
    maxDiff = None

    def request(self, method, user, path, body=None):
        client = Client()
        if user:
            client.force_login(user)
        resp = getattr(client, method)(
            path,
            json.dumps(body) if body is not None else None,
            content_type="application/json",
        )
        out = resp.json() if resp.content else None
        if isinstance(out, dict):
            # No tests for times in output, yet.
            out.pop("created_at", None)
            out.pop("modified_at", None)
        return resp.status_code, out


class IndividualAnnotationsViewTest(ApiAnnotationsTestBase):
    def post(self, user, ind_id, body):
        return self.request(
            "post", user, "/api/v1/individuals/%d/annotations/" % ind_id, body
        )

    def body(self, **kwargs):
        return dict(
            dict(
                age=7,
                rating="1",
                authority=20,
                comment="",
                axis_poly=[[50, 50], [90, 20]],
                project=None,
            ),
            **kwargs,
        )

    def test_post(self):
        user = self.create_user("jbloggs", groups=["General Annotation Editor"])
        ind = self.create_individual()

        # Need to be logged in, existing individual
        self.assertEqual(self.post(None, ind.id, self.body())[0], 401)
        self.assertEqual(
            self.post(user, 9999, self.body()),
            (
                404,
                dict(
                    error_class="Http404",
                    error="No Individual matches the given query.",
                ),
            ),
        )

        # Created, rating in official notation
        status, out = self.post(user, ind.id, self.body(comment="UT comment"))
        ann = Annotation.objects.get(individual=ind)
        self.assertEqual(
            (status, out),
            (
                201,
                dict(
                    id=ann.id,
                    individual_id=ind.id,
                    created_by="jbloggs",
                    age=7,
                    rating="1",
                    authority=20,
                    comment="UT comment",
                    axis_poly=[[50, 50], [90, 20]],
                    project=None,
                ),
            ),
        )
        self.assertEqual(
            (ann.created_by, ann.rating, ann.authority),
            (user, Annotation.Rating.GOOD, 20),
        )
        for rating, stored in [
            ("2", Annotation.Rating.DIFFICULT),
            ("3", Annotation.Rating.UNREADABLE),
        ]:
            status, out = self.post(user, ind.id, self.body(rating=rating))
            self.assertEqual((status, out["rating"]), (201, rating))
            self.assertEqual(Annotation.objects.get(pk=out["id"]).rating, stored)

        # comment, project are optional
        status, out = self.post(
            user,
            ind.id,
            dict(age=3, rating="1", authority=50, axis_poly=[[0, 0], [1, 1]]),
        )
        self.assertEqual((status, out["comment"], out["project"]), (201, "", None))

    def test_post__validation(self):
        user = self.create_user(groups=["General Annotation Editor"])
        ind = self.create_individual()

        def post_err(body):
            status, out = self.post(user, ind.id, body)
            self.assertEqual((status, out["error_class"]), (400, "ValidationError"))
            return out.get("fields", out["error"])

        self.assertEqual(post_err(dict(parp=1)), "Unknown keys: parp")
        self.assertEqual(
            post_err(dict()),
            {
                "age": ["This field is required."],
                "rating": ["This field is required."],
                "authority": ["This field is required."],
                "axis_poly": ["This field is required."],
            },
        )
        self.assertEqual(
            post_err(
                self.body(rating=100, age="x", axis_poly=[0, 0], authority="parp")
            ),
            {
                "rating": ['rating should be one of "1", "2", "3", not 100'],
                "age": ["Enter a whole number."],
                "authority": [
                    "Select a valid choice. parp is not one of the available choices."
                ],
                "axis_poly": ["axis_poly should be [[x, y], ...], not [0, 0]"],
            },
        )
        self.assertEqual(
            post_err(self.body(rating="4", project=9999)),
            {
                "rating": ['rating should be one of "1", "2", "3", not 4'],
                "project": [
                    "Select a valid choice. That choice is not one of the available choices."
                ],
            },
        )
        self.assertEqual(Annotation.objects.filter(individual=ind).count(), 0)

    def test_post__authority(self):
        """authority can't exceed the user's own level, as the annotate form"""
        user = self.create_user(
            groups=["General Annotation Editor"],
            base_authority_level=UserSpeciesAuthority.AuthorityLevel.JUNIOR,
        )
        ind = self.create_individual()

        for authority, status in [(20, 201), (80, 201), (85, 201), (100, 400)]:
            self.assertEqual(
                self.post(user, ind.id, self.body(authority=authority))[0],
                status,
                msg=authority,
            )
        self.assertEqual(
            self.post(user, ind.id, self.body(authority=100))[1]["fields"],
            {
                "authority": [
                    "Select a valid choice. 100 is not one of the available choices."
                ]
            },
        )

        # Without a profile, users are inexperienced
        user = self.create_user(groups=["General Annotation Editor"])
        self.assertEqual(self.post(user, ind.id, self.body(authority=55))[0], 201)
        self.assertEqual(self.post(user, ind.id, self.body(authority=80))[0], 400)

    def test_post__access(self):
        """Need to be able to annotate generally, or in the project"""
        editor = self.create_user(groups=["General Annotation Editor"])
        viewer = self.create_user(groups=["General Annotation Viewer"])
        member = self.create_user()
        ind = self.create_individual()
        p_open = self.create_project(team=[member, editor], individuals=[ind])
        p_closed = self.create_project(team=[member, editor], individuals=[ind])
        self.close_project(p_closed)

        self.assertEqual(
            self.post(viewer, ind.id, self.body()),
            (
                403,
                dict(
                    error_class="PermissionDenied",
                    error="Contact an administrator to be added to the general annotation group",
                ),
            ),
        )
        self.assertEqual(
            self.post(viewer, ind.id, self.body(project=p_open.id)),
            (
                403,
                dict(
                    error_class="PermissionDenied",
                    error="Contact an administrator to be added to this project",
                ),
            ),
        )
        self.assertEqual(
            self.post(member, ind.id, self.body(project=p_closed.id)),
            (
                403,
                dict(
                    error_class="PermissionDenied",
                    error="Project %s closed, cannot edit annotations" % p_closed,
                ),
            ),
        )
        self.assertEqual(self.post(member, ind.id, self.body())[0], 403)
        self.assertEqual(Annotation.objects.filter(individual=ind).count(), 0)

        status, out = self.post(member, ind.id, self.body(project=p_open.id))
        self.assertEqual((status, out["project"]), (201, p_open.id))
        self.assertEqual(self.post(editor, ind.id, self.body())[0], 201)


class AnnotationViewTest(ApiAnnotationsTestBase):
    def delete(self, user, ann_id):
        return self.request("delete", user, "/api/v1/annotations/%d/" % ann_id)

    def test_delete(self):
        owner = self.create_user(groups=["General Annotation Editor"])
        other = self.create_user(groups=["General Annotation Editor"])
        su = self.create_user()
        su.is_superuser = True
        su.save()
        ind = self.create_individual()
        ann = self.create_annotation(ind, created_by=owner)
        ann_other = self.create_annotation(ind, created_by=other)

        self.assertEqual(self.delete(None, ann.id)[0], 401)
        self.assertEqual(self.delete(owner, 9999)[0], 404)

        # Only the owner (or superuser) can delete
        self.assertEqual(
            self.delete(other, ann.id),
            (
                403,
                dict(
                    error_class="PermissionDenied",
                    error="You do not own annotation %s" % ann,
                ),
            ),
        )
        self.assertEqual(self.delete(owner, ann.id), (204, None))
        self.assertFalse(Annotation.objects.filter(pk=ann.id).exists())
        self.assertEqual(self.delete(owner, ann.id)[0], 404)
        self.assertEqual(self.delete(su, ann_other.id), (204, None))

    def test_delete__closed_project(self):
        user = self.create_user()
        ind = self.create_individual()
        p = self.create_project(team=[user], individuals=[ind])
        ann = self.create_annotation(ind, created_by=user, project=p)
        self.close_project(p)

        self.assertEqual(
            self.delete(user, ann.id),
            (
                403,
                dict(
                    error_class="PermissionDenied",
                    error="Project %s closed, cannot edit annotations" % p,
                ),
            ),
        )
        self.assertTrue(Annotation.objects.filter(pk=ann.id).exists())
