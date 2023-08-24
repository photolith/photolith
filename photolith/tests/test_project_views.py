from django.test import RequestFactory, TestCase

from ..project.views import ProjectCreateView


class ProjectCreateViewTest(TestCase):
    def test_get_initial(self):
        def get_initial(**qs):
            request = RequestFactory().get("/", qs)
            v = ProjectCreateView(request=request)
            return v.get_initial()

        # All-empty values filitered in search_qs
        self.assertEqual(
            get_initial(
                peep=[1, "", 2],
                moo=[1, 2, ""],
                oink=["", ""],
                baa="",
            )["search_qs"],
            "peep=1&peep=&peep=2&moo=1&moo=2&moo=",
        )
