from django.contrib.auth.models import AnonymousUser
from django.test import RequestFactory, TestCase

from ..home.views import IndexView
from ..models import Annotation, Individual, Image, Project

from .requires_utils import RequiresUtils


class IndexViewTest(RequiresUtils, TestCase):
    def ctx(self, user=None):
        request = RequestFactory().get("/", {})
        request.user = user if user else AnonymousUser()
        v = IndexView()
        v.setup(request, **(request.GET.dict()))

        context = v.get_context_data()

        # Not interested in project content, that's for project_list to worry about
        if context["projects"] != []:
            context["projects"] = [p.name for p in context["projects"].all()]

        return context

    def test_get_context_data__projects(self):
        """Nab the projects from ProjectListView"""
        user1 = self.create_user(groups=["General Annotation Editor"])
        user2 = self.create_user(groups=["General Annotation Editor"])
        userA1 = self.create_user(groups=["General Annotation Editor", "Project Admin"])

        self.create_project(
            name="p1.1",
            team=[user1],
            date_end_delta=dict(days=4),
            created_by=userA1,
        )

        # Unauth sees nothing
        self.assertEqual(self.ctx(None)["projects"], [])

        # Can see projects
        self.assertEqual(self.ctx(user1)["projects"], ["p1.1"])
        self.assertEqual(self.ctx(user2)["projects"], [])

    def test_get_headline_numbers(self):
        self.assertEqual(
            self.ctx()["headline_numbers"],
            dict(
                annotations=0,
                images=0,
                ind_by_species=dict(),
                individuals=0,
            ),
        )

        # Images in images count
        imgs = [self.create_image() for _ in range(3)]
        self.assertEqual(
            self.ctx()["headline_numbers"],
            dict(
                annotations=0,
                images=3,
                ind_by_species=dict(),
                individuals=0,
            ),
        )

        # Major number of species appears in breakdown
        inds = [
            self.create_individual(
                data=dict(
                    tx_species={"id": 100, "en": "Fish [FSH]", "is": "Fiskur [FSH]"}
                )
            )
            for _ in range(20)
        ]
        self.assertEqual(
            self.ctx()["headline_numbers"],
            dict(
                annotations=0,
                images=3 + 20,
                ind_by_species=dict(Fish=20),
                individuals=20,
            ),
        )

        # Minor species not included in breakdown
        inds = [
            self.create_individual(
                data=dict(
                    tx_species={"id": 101, "en": "Cat [CAT]", "is": "Köttur [CAT]"}
                )
            )
            for _ in range(5)
        ]
        self.assertEqual(
            self.ctx()["headline_numbers"],
            dict(
                annotations=0,
                images=3 + 20 + 5,
                ind_by_species=dict(Fish=20),
                individuals=20 + 5,
            ),
        )

        # Missing species doesn't get a breakdown either
        inds = [self.create_individual() for _ in range(30)]
        self.assertEqual(
            self.ctx()["headline_numbers"],
            dict(
                annotations=0,
                images=3 + 20 + 5 + 30,
                ind_by_species=dict(Fish=20),
                individuals=20 + 5 + 30,
            ),
        )

        user1 = self.create_user("user1")
        ann = self.create_annotation(inds[0], user1, created_delta=dict(days=-5))
        ann = self.create_annotation(inds[0], user1, created_delta=dict(days=-4))
        ann = self.create_annotation(inds[0], user1, created_delta=dict(days=-3))
        self.assertEqual(
            self.ctx()["headline_numbers"],
            dict(
                annotations=3,
                images=3 + 20 + 5 + 30,
                ind_by_species=dict(Fish=20),
                individuals=20 + 5 + 30,
            ),
        )
