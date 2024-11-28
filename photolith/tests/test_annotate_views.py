import datetime
import json
import random
import re

from django.core.exceptions import BadRequest, PermissionDenied
from django.test import Client, RequestFactory, TestCase

from ..annotate.views import AnnotateView, AnnotateStartView, DeleteView
from ..models import Annotation, Individual, Image, Project, UserSpeciesAuthority

from .requires_utils import RequiresUtils


class AnnotateViewTest(RequiresUtils, TestCase):
    def form_post(self, user, ind, qs_project=None, **kwargs):
        ann_dict = dict(
            individual=ind.id,
            project=kwargs["project"].id if kwargs.get("project") else "",
            age=kwargs.get("age", 10),
            axis_poly=kwargs.get("axis_poly", [[0, 0], [1, 1], [2, 2]]),
            comment=kwargs.get("comment", "UT comment %f" % random.uniform(100, 1000)),
            authority=str(user.userprofile.base_authority_level),
            rating=kwargs.get("rating", Annotation.Rating.GOOD),
        )
        qs = ""
        if qs_project:
            qs += "&project=%d" % qs_project.id

        client = Client()
        client.force_login(user)
        resp = client.post(
            "/annotate/%d/%s?%s" % (ind.id, kwargs.get("annotation_id", ""), qs),
            ann_dict,
        )
        if resp.status_code == 403:
            # Reconstitute python error if we can
            m = re.search(
                r'<p class="err-detail">(.*?)</p>', resp.content.decode("utf-8")
            )
            if m:
                raise PermissionDenied(m.group(1))
        self.assertEqual(resp.status_code, 302)
        m = re.fullmatch(r"/annotate/(\d+)/\?(.*)", resp.url)
        self.assertTrue(m is not None)
        self.assertEqual(int(m.group(1)), ind.id)
        out = Annotation.objects.get(comment=ann_dict["comment"])
        return out

    def test_form_valid__general(self):
        """Can only annotate if a general Annotation Editor"""
        user0 = self.create_user(groups=[], base_authority_level=50)
        user1 = self.create_user(
            groups=["General Annotation Viewer"], base_authority_level=50
        )
        user2 = self.create_user(
            groups=["General Annotation Editor"], base_authority_level=50
        )
        ind = [self.create_individual() for _ in range(random.randrange(1, 9))][-1]

        # Viewers can't save
        with self.assertRaisesRegex(PermissionDenied, "general annotation"):
            ann = self.form_post(user0, ind)
        with self.assertRaisesRegex(PermissionDenied, "general annotation"):
            ann = self.form_post(user1, ind)

        # Editors can
        ann = self.form_post(user2, ind)
        self.assertEqual(ann.project, None)

        # Can't save someone else's annotation
        user3 = self.create_user(
            groups=["General Annotation Editor"], base_authority_level=50
        )
        with self.assertRaisesRegex(PermissionDenied, "do not own"):
            ann = self.form_post(user3, ind, annotation_id=ann.id)

    def test_form_valid__project(self):
        """Can only annotate in open projects"""
        user1 = self.create_user(
            groups=["General Annotation Editor"], base_authority_level=50
        )
        user2 = self.create_user(
            groups=["General Annotation Editor"], base_authority_level=50
        )
        ind = [self.create_individual() for _ in range(random.randrange(1, 9))][-1]
        p1 = [self.create_project(team=[user1]) for _ in range(random.randrange(1, 9))][
            -1
        ]

        # Can't save to project we're not part of
        with self.assertRaisesRegex(PermissionDenied, "added to this project"):
            ann = self.form_post(user2, ind, project=p1, qs_project=None)

        self.close_project(p1)

        # Can't save to closed project
        with self.assertRaisesRegex(PermissionDenied, p1.name):
            ann = self.form_post(user1, ind, project=p1, qs_project=p1)

        # The querystring project wasn't used
        # Can save outside a valid project
        ann = self.form_post(user1, ind, project=None, qs_project=p1)
        self.assertEqual(ann.project, None)

        # ...even if it wasn't our project
        ann = self.form_post(user1, ind, project=None, qs_project=p1)
        self.assertEqual(ann.project, None)

    def test_get_initial(self):
        user1 = self.create_user(
            "user1", groups=["General Annotation Viewer"], base_authority_level=50
        )

        def get_initial(ind, ann=None, **kwargs):
            kwargs["individual_id"] = ind.id
            request = RequestFactory().get("/", kwargs)
            request.user = user1
            v = AnnotateView()
            v.setup(request, **(request.GET.dict()))
            v.object = ann
            out = v.get_initial()
            return out

        # Create a few so id isn't just 1
        ind = [self.create_individual() for _ in range(random.randrange(1, 9))][-1]
        p = [self.create_project(team=[user1]) for _ in range(random.randrange(1, 9))][
            -1
        ]

        # Current individual set
        self.assertEqual(get_initial(ind)["individual"], ind.id)
        # No project = None
        self.assertEqual(get_initial(ind)["project"], None)
        # Open project passed through
        self.assertEqual(get_initial(ind, project=p.id)["project"], p)

    def test_get_object(self):
        def get_object(**kwargs):
            request = RequestFactory().get("/", kwargs)
            v = AnnotateView()
            v.setup(request, **(request.GET.dict()))
            out = v.get_object()
            return out

        ind = Individual.objects.create(
            image=self.create_image(),
            bounding_box=[[0, 0], [100, 100]],
        )
        ind.save()
        user1 = self.create_user("user1")
        ann = self.create_annotation(ind, user1, created_delta=dict(days=-5))
        ann.save()
        # Returns None, not an error (as the default would)
        self.assertEqual(get_object(), None)
        self.assertEqual(get_object(individual_id=ind.id), None)

        # Returns annotation object
        self.assertEqual(get_object(individual_id=ind.id, annotation_id=ann.id), ann)

        # individual mismatch reported
        with self.assertRaisesRegexp(BadRequest, r"individual"):
            get_object(individual_id=ind.id + 1, annotation_id=ann.id)

    def test_get_all_annotations(self):
        def get_all_annotations(individual, project=None, user=None):
            if isinstance(project, dict):
                p = self.create_project(**project)
            else:
                p = project
            request = RequestFactory().get(
                "/",
                dict(
                    individual_id=individual.id,
                    project=p.id if p else "",
                ),
            )
            request.user = user
            v = AnnotateView()
            v.setup(request, **(request.GET.dict()))
            out = v.get_all_annotations()
            return [
                "-".join(
                    (
                        str(a.age),
                        a.created_by.username if a.created_by else "None",
                        str((self.now - a.created_at).days),
                    )
                )
                for a in out
            ]

        # No annotations for individual yet
        ind = Individual.objects.create(
            image=self.create_image("moo1.jpg"),
            bounding_box=[[0, 0], [100, 100]],
        )
        user1 = self.create_user("user1", groups=["General Annotation Viewer"])
        user2 = self.create_user("user2")
        user3 = self.create_user("user3")
        user4 = self.create_user("user4")
        userA = self.create_user("userA", groups=["Project Admin"])

        self.assertEqual(get_all_annotations(ind, user=user1), [])

        # Create 4 annotations, see all 4, newest first
        self.create_annotation(ind, user1, created_delta=dict(days=-3))
        self.create_annotation(ind, user1, created_delta=dict(days=-2))
        self.create_annotation(ind, user2, created_delta=dict(days=-3))
        self.create_annotation(ind, user3, created_delta=dict(days=-3))
        self.assertEqual(
            get_all_annotations(ind, user=user1),
            [
                "10-user1-2",
                "10-user1-3",
                "10-user2-3",
                "10-user3-3",
            ],
        )

        # Projects have no annotations
        self.assertEqual(
            get_all_annotations(
                ind,
                project=dict(
                    created_by=user3, base_user=None, team=[user1, user2, user3]
                ),
                user=user3,
            ),
            [],
        )

        # ...unless we assign a base user, get the most recent one, details blanked
        self.assertEqual(
            get_all_annotations(
                ind,
                project=dict(
                    created_by=user3, base_user=user1, team=[user1, user2, user3]
                ),
                user=user3,
            ),
            ["0-user1-2"],
        )

        # Assign a project with a base_user, only see init_annotation (which isn't part of project)
        # and your own annotations
        p = self.create_project(
            created_by=user3,
            base_user=user1,
            team=[user1, user2, user3],
        )
        self.create_annotation(ind, user1, created_delta=dict(days=-5), project=p)
        self.create_annotation(ind, user1, created_delta=dict(days=-4), project=p)
        self.create_annotation(ind, user2, created_delta=dict(days=-3), project=p)
        self.create_annotation(ind, user2, created_delta=dict(days=-2), project=p)
        self.assertEqual(p.is_open, True)
        self.assertEqual(
            get_all_annotations(ind, project=p, user=user3),
            [
                "0-user1-2",
            ],
        )
        self.assertEqual(
            get_all_annotations(ind, project=p, user=user1),
            [
                "10-user1-4",
                "10-user1-5",
                "0-user1-2",
            ],
        )
        self.assertEqual(
            get_all_annotations(ind, project=p, user=user2),
            [
                "10-user2-2",
                "10-user2-3",
                "0-user1-2",
            ],
        )

        # Don't see project annotations outside project
        self.assertEqual(
            get_all_annotations(ind, user=user1),
            [
                "10-user1-2",
                "10-user1-3",
                "10-user2-3",
                "10-user3-3",
            ],
        )

        # user4 not part of the project
        with self.assertRaisesRegex(PermissionDenied, "administrator"):
            get_all_annotations(ind, project=p, user=user4),

        # userA isn't either, being a project admin isn't enough
        with self.assertRaisesRegex(PermissionDenied, "administrator"):
            get_all_annotations(ind, project=p, user=userA),

        # Close & see everything part of project
        p.date_end = (self.now + datetime.timedelta(days=-1)).date()
        p.save()
        self.assertEqual(p.is_open, False)
        self.assertEqual(
            get_all_annotations(ind, project=p, user=user3),
            [
                "10-user2-2",
                "10-user2-3",
                "10-user1-4",
                "10-user1-5",
            ],
        )
        # UserA still can't get in
        with self.assertRaisesRegex(PermissionDenied, "administrator"):
            get_all_annotations(ind, project=p, user=userA),

        # user4 still not part of the project
        with self.assertRaisesRegex(PermissionDenied, "administrator"):
            get_all_annotations(ind, project=p, user=user4),

    def test_get_individual(self):
        def get_ind(individual):
            request = RequestFactory().get(
                "/",
                dict(
                    individual_id=individual.id,
                    annotation_id="",
                    project="",
                ),
            )
            v = AnnotateView()
            v.setup(request, **(request.GET.dict()))
            out = v.get_individual()
            return out

        # scale & inverse populated from image
        out = get_ind(
            self.create_individual(
                image=self.create_image(scale_line=[(0, 0), (1, 0)], scale_mm=10),
            )
        )
        self.assertAlmostEqual(out["image__px_to_mm"], 10)
        self.assertAlmostEqual(out["image__mm_to_px"], 0.1)
        out = get_ind(
            self.create_individual(
                image=self.create_image(scale_line=[(0, 0), (1, 0)], scale_mm=None),
            )
        )
        self.assertAlmostEqual(out["image__px_to_mm"], None)
        self.assertAlmostEqual(out["image__mm_to_px"], None)

    def test_get_context_data(self):
        def ctx_data(individual, annotation=None, project=None, user=None):
            if isinstance(project, dict):
                p = self.create_project(**project)
            else:
                p = project
            request = RequestFactory().get(
                "/",
                dict(
                    individual_id=individual.id,
                    annotation_id=annotation.id if annotation else "",
                    project=p.id if p else "",
                ),
            )
            request.user = user
            v = AnnotateView()
            v.object = annotation  # NB: Bodge what should be happening in post()
            v.setup(request, **(request.GET.dict()))
            out = v.get_context_data()
            return out

        user0 = self.create_user(groups=[])
        user1 = self.create_user(groups=["General Annotation Editor"])
        user2 = self.create_user(groups=["General Annotation Viewer"])
        user3 = self.create_user(groups=["General Annotation Viewer"])
        ind = self.create_individual()

        # Need to be at least a General Annotation Viewer to view general annotations
        with self.assertRaisesRegex(PermissionDenied, "general"):
            out = ctx_data(ind, user=user0)

        # No annotations, displaying editor for general annotators
        out = ctx_data(ind, user=user1)
        self.assertEqual(out["default_tab"], "editor")
        self.assertEqual(out["read_only"], False)
        self.assertEqual(out["form"].initial["axis_poly"], [[50.0, 50.0], [5, 5]])
        out = ctx_data(ind, user=user2)
        self.assertEqual(out["default_tab"], "existing")
        self.assertEqual(out["read_only"], True)

        # Annotate, show list of existing annotations, default still initial annotation
        ann1 = self.create_annotation(
            ind, axis_poly=[[3, 0], [4, 9], [2, 2]], created_by=user1
        )
        ann2 = self.create_annotation(
            ind, axis_poly=[[6, 1], [4, 5], [2, 3]], created_by=user1
        )
        out = ctx_data(ind, user=user1)
        self.assertEqual(out["default_tab"], "existing")
        self.assertEqual(out["read_only"], False)
        self.assertEqual(out["form"].instance.id, None)
        self.assertEqual(out["form"].initial["axis_poly"], [[50.0, 50.0], [5, 5]])

        # Can explicitly edit either
        out = ctx_data(ind, annotation=ann1, user=user1)
        self.assertEqual(out["default_tab"], "editor")
        self.assertEqual(out["read_only"], False)
        self.assertEqual(out["form"].instance.id, ann1.id)
        self.assertEqual(out["form"].initial["axis_poly"], ann1.axis_poly)
        out = ctx_data(ind, annotation=ann2, user=user1)
        self.assertEqual(out["default_tab"], "editor")
        self.assertEqual(out["read_only"], False)
        self.assertEqual(out["form"].instance.id, ann2.id)
        self.assertEqual(out["form"].initial["axis_poly"], ann2.axis_poly)

        # Create a project without base_user, users isolated from other edits
        p = self.create_project(team=[user1, user2, user3], individuals=[ind])
        out = ctx_data(ind, project=p, user=user2)
        self.assertEqual(out["default_tab"], "editor")
        self.assertEqual(out["read_only"], False)
        self.assertEqual(out["form"].initial["axis_poly"], [[50.0, 50.0], [5, 5]])
        ann = self.create_annotation(
            ind, axis_poly=[[25, 34], [44, 93], [22, 52]], created_by=user2, project=p
        )
        out = ctx_data(ind, project=p, user=user2)
        self.assertEqual(out["default_tab"], "existing")
        self.assertEqual(out["read_only"], False)
        self.assertEqual(out.get("project_closed", False), False)
        self.assertEqual(out["form"].initial["project"], p)
        self.assertEqual(out["form"].initial["axis_poly"], [[50.0, 50.0], [5, 5]])
        self.assertEqual(
            [a.axis_poly for a in out["all_annotations"]],
            [
                ann.axis_poly,
            ],
        )
        out = ctx_data(ind, project=p, user=user3)
        self.assertEqual(out["default_tab"], "editor")
        self.assertEqual(out["read_only"], False)
        self.assertEqual(out.get("project_closed", False), False)
        self.assertEqual(out["form"].initial["project"], p)
        self.assertEqual(out["form"].initial["axis_poly"], [[50.0, 50.0], [5, 5]])
        self.assertEqual([a.axis_poly for a in out["all_annotations"]], [])

        # Close project, we see everything
        self.close_project(p)
        out = ctx_data(ind, project=p, user=user3)
        self.assertEqual(out["default_tab"], "existing")
        self.assertEqual(out["read_only"], True)  # Not a general annotator
        self.assertEqual(out.get("project_closed", False), True)
        self.assertEqual(out["form"].initial["project"], None)  # Project cleared
        self.assertEqual(
            [a.axis_poly for a in out["all_annotations"]],
            [
                ann.axis_poly,
            ],
        )

        # Project with base_user, base ignored for default_tab
        ind2 = self.create_individual()
        p = self.create_project(
            team=[user1, user2, user3], individuals=[ind, ind2], base_user=user1
        )
        out = ctx_data(ind, project=p, user=user2)
        self.assertEqual(out["default_tab"], "editor")
        self.assertEqual(out["read_only"], False)
        self.assertEqual(
            out["form"].initial["axis_poly"], [ann1.axis_poly[0], ann1.axis_poly[-1]]
        )
        self.assertEqual(
            [a.axis_poly for a in out["all_annotations"]],
            [
                [ann1.axis_poly[0], ann1.axis_poly[-1]],
            ],
        )
        ann = self.create_annotation(
            ind,
            axis_poly=[[252, 344], [424, 93], [322, 542]],
            created_by=user2,
            project=p,
        )
        out = ctx_data(ind, project=p, user=user2)
        self.assertEqual(out["default_tab"], "existing")
        self.assertEqual(out["read_only"], False)
        self.assertEqual(
            out["form"].initial["axis_poly"], [ann1.axis_poly[0], ann1.axis_poly[-1]]
        )
        self.assertEqual(
            [a.axis_poly for a in out["all_annotations"]],
            [
                ann.axis_poly,
                [ann1.axis_poly[0], ann1.axis_poly[-1]],
            ],
        )

        # Without a base_user annotation (which ind2 doesn't have), we continue as before
        out = ctx_data(ind2, project=p, user=user2)
        self.assertEqual(out["default_tab"], "editor")
        self.assertEqual(out["read_only"], False)
        self.assertEqual(out["form"].initial["axis_poly"], [[50.0, 50.0], [5, 5]])
        self.assertEqual([a.axis_poly for a in out["all_annotations"]], [])
        ann = self.create_annotation(
            ind2,
            axis_poly=[[252, 344], [424, 93], [322, 542]],
            created_by=user2,
            project=p,
        )
        out = ctx_data(ind2, project=p, user=user2)
        self.assertEqual(out["default_tab"], "existing")
        self.assertEqual(out["read_only"], False)
        self.assertEqual(out["form"].initial["axis_poly"], [[50.0, 50.0], [5, 5]])
        self.assertEqual(
            [a.axis_poly for a in out["all_annotations"]],
            [
                ann.axis_poly,
            ],
        )

    def test_get_context_data__authority(self):
        def auth_choices(user, individual):
            request = RequestFactory().get(
                "/",
                dict(
                    individual_id=individual.id,
                    annotation_id="",
                    project="",
                ),
            )
            request.user = user
            v = AnnotateView()
            v.object = None  # NB: Bodge what should be happening in post()
            v.setup(request, **(request.GET.dict()))
            context = v.get_context_data()

            # initial choice always user's default
            if hasattr(user, "userprofile"):
                auth_level = user.userprofile.authority_level(individual.data)
            else:
                auth_level = UserSpeciesAuthority.AuthorityLevel.INEXPERIENCED
            self.assertEqual(context["form"].initial["authority"], auth_level)

            return context["form"].fields["authority"].choices

        ind_nospecies = self.create_individual()
        ind_fish = self.create_individual(
            data=dict(tx_species={"id": 100, "en": "Fish", "is": "Fiskur"}),
        )
        ind_rock = self.create_individual(
            data=dict(tx_species={"id": 200, "en": "Rock", "is": "Rockur"}),
        )

        # User without profile isn't an authority
        user = self.create_user(groups=["General Annotation Editor"])
        self.assertEqual(
            auth_choices(user, ind_nospecies),
            [
                (20, "Automated reader, from image"),
                (25, "Automated reader, with original otoliths or slides"),
                (50, "Inexperienced, from image"),
                (55, "Inexperienced, with original otoliths or slides"),
            ],
        )

        # Add profile, only authority for relevant species
        user = self.create_user(
            groups=["General Annotation Editor"],
            species_authority=[("Fish", UserSpeciesAuthority.AuthorityLevel.EXPERT)],
        )
        self.assertEqual(
            auth_choices(user, ind_nospecies),
            [
                (20, "Automated reader, from image"),
                (25, "Automated reader, with original otoliths or slides"),
                (50, "Inexperienced, from image"),
                (55, "Inexperienced, with original otoliths or slides"),
            ],
        )
        self.assertEqual(
            auth_choices(user, ind_fish),
            [
                (20, "Automated reader, from image"),
                (25, "Automated reader, with original otoliths or slides"),
                (50, "Inexperienced, from image"),
                (55, "Inexperienced, with original otoliths or slides"),
                (80, "Junior, from image"),
                (85, "Junior, with original otoliths or slides"),
                (100, "Expert, from image"),
                (105, "Expert, with original otoliths or slides"),
            ],
        )
        self.assertEqual(
            auth_choices(user, ind_rock),
            [
                (20, "Automated reader, from image"),
                (25, "Automated reader, with original otoliths or slides"),
                (50, "Inexperienced, from image"),
                (55, "Inexperienced, with original otoliths or slides"),
            ],
        )

        user = self.create_user(
            groups=["General Annotation Editor"],
            species_authority=[
                ("Fish", UserSpeciesAuthority.AuthorityLevel.JUNIOR),
                ("Rock", UserSpeciesAuthority.AuthorityLevel.SENIOR_EXPERT),
            ],
        )
        self.assertEqual(
            auth_choices(user, ind_nospecies),
            [
                (20, "Automated reader, from image"),
                (25, "Automated reader, with original otoliths or slides"),
                (50, "Inexperienced, from image"),
                (55, "Inexperienced, with original otoliths or slides"),
            ],
        )
        self.assertEqual(
            auth_choices(user, ind_fish),
            [
                (20, "Automated reader, from image"),
                (25, "Automated reader, with original otoliths or slides"),
                (50, "Inexperienced, from image"),
                (55, "Inexperienced, with original otoliths or slides"),
                (80, "Junior, from image"),
                (85, "Junior, with original otoliths or slides"),
            ],
        )
        self.assertEqual(
            auth_choices(user, ind_rock),
            [
                (20, "Automated reader, from image"),
                (25, "Automated reader, with original otoliths or slides"),
                (50, "Inexperienced, from image"),
                (55, "Inexperienced, with original otoliths or slides"),
                (80, "Junior, from image"),
                (85, "Junior, with original otoliths or slides"),
                (100, "Expert, from image"),
                (105, "Expert, with original otoliths or slides"),
                (120, "Senior expert, from image"),
                (125, "Senior expert, with original otoliths or slides"),
            ],
        )

        user = self.create_user(
            groups=["General Annotation Editor"],
            base_authority_level=UserSpeciesAuthority.AuthorityLevel.JUNIOR,
            species_authority=[
                ("Rock", UserSpeciesAuthority.AuthorityLevel.SENIOR_EXPERT),
            ],
        )
        self.assertEqual(
            auth_choices(user, ind_nospecies),
            [
                (20, "Automated reader, from image"),
                (25, "Automated reader, with original otoliths or slides"),
                (50, "Inexperienced, from image"),
                (55, "Inexperienced, with original otoliths or slides"),
                (80, "Junior, from image"),
                (85, "Junior, with original otoliths or slides"),
            ],
        )
        self.assertEqual(
            auth_choices(user, ind_fish),
            [
                (20, "Automated reader, from image"),
                (25, "Automated reader, with original otoliths or slides"),
                (50, "Inexperienced, from image"),
                (55, "Inexperienced, with original otoliths or slides"),
                (80, "Junior, from image"),
                (85, "Junior, with original otoliths or slides"),
            ],
        )
        self.assertEqual(
            auth_choices(user, ind_rock),
            [
                (20, "Automated reader, from image"),
                (25, "Automated reader, with original otoliths or slides"),
                (50, "Inexperienced, from image"),
                (55, "Inexperienced, with original otoliths or slides"),
                (80, "Junior, from image"),
                (85, "Junior, with original otoliths or slides"),
                (100, "Expert, from image"),
                (105, "Expert, with original otoliths or slides"),
                (120, "Senior expert, from image"),
                (125, "Senior expert, with original otoliths or slides"),
            ],
        )


class AnnotateStartViewTest(RequiresUtils, TestCase):
    def test_project_progress(self):
        def pp(user, project):
            request = RequestFactory().get(
                "/",
                dict(
                    project=project.id,
                ),
            )
            request.user = user
            v = AnnotateStartView()
            v.setup(request, **(request.GET.dict()))
            out = v.project_progress()
            return [(int(o.data["nm_idx"]), o.num_annotations) for o in out]

        user1 = self.create_user()
        user2 = self.create_user()
        user3 = self.create_user()
        userA = self.create_user("userA", groups=["Project Admin"])

        # 2 projects with same individuals
        p1 = self.create_project(individuals=4, created_by=userA, team=[user1, user2])
        p2 = self.create_project(
            individuals=p1.individuals.all()[1:3], team=[user1, user2], created_by=userA
        )

        # Nothing annotated yet
        self.assertEqual(pp(user1, p1), [(0, 0), (1, 0), (2, 0), (3, 0)])

        # Do some annotation, counts go up
        ann = self.create_annotation(p1.individuals.all()[1], user1, project=p1)
        self.assertEqual(pp(user1, p1), [(0, 0), (1, 1), (2, 0), (3, 0)])
        ann = self.create_annotation(p1.individuals.all()[1], user1, project=p1)
        self.assertEqual(pp(user1, p1), [(0, 0), (1, 2), (2, 0), (3, 0)])
        ann = self.create_annotation(p1.individuals.all()[2], user1, project=p1)
        self.assertEqual(pp(user1, p1), [(0, 0), (1, 2), (2, 1), (3, 0)])

        # user2 doesn't see them & vice versa
        self.assertEqual(pp(user2, p1), [(0, 0), (1, 0), (2, 0), (3, 0)])
        ann = self.create_annotation(p1.individuals.all()[1], user2, project=p1)
        self.assertEqual(pp(user2, p1), [(0, 0), (1, 1), (2, 0), (3, 0)])
        self.assertEqual(pp(user1, p1), [(0, 0), (1, 2), (2, 1), (3, 0)])

        # Projects are also isolated from each other
        self.assertEqual(pp(user1, p2), [(1, 0), (2, 0)])
        ann = self.create_annotation(p2.individuals.all()[0], user1, project=p2)
        self.assertEqual(pp(user1, p2), [(1, 1), (2, 0)])
        self.assertEqual(pp(user1, p1), [(0, 0), (1, 2), (2, 1), (3, 0)])


class AnnotateDeleteViewTest(RequiresUtils, TestCase):
    def ann_del(self, ann, user):
        client = Client()
        client.force_login(user)
        resp = client.post("/annotate/delete/%d/" % (ann.id,), {})
        return (
            resp.status_code,
            json.loads(resp.content)
            if resp.headers["Content-Type"] == "application/json"
            else resp.content,
        )

    def test_call(self):
        user1 = self.create_user(groups=["General Annotation Editor"])
        ind = self.create_individual()
        ann = self.create_annotation(ind, created_by=user1)

        # Can't delete something you don't own
        user2 = self.create_user(groups=["General Annotation Editor"])
        out = self.ann_del(ann, user2)
        self.assertEqual(
            out,
            (
                500,
                dict(
                    error_class="PermissionDenied",
                    error="You do not own annotation %s" % str(ann),
                ),
            ),
        )

        out = self.ann_del(ann, user1)
        self.assertEqual(
            out,
            (
                200,
                dict(
                    message="Successfully deleted annotation",
                    old_annotation_id=ann.id,
                ),
            ),
        )
        self.assertEqual(Annotation.objects.filter(pk=ann.id).first(), None)
