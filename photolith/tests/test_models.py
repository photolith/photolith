import datetime

from django.test import TestCase

from ..models import *


class ProjectTest(TestCase):
    maxDiff = None

    def test_is_open(self):
        """A project is open iff it's end_date hasn't passed"""
        p = Project.objects.create()

        # Initially date_end is in 4 weeks, is open
        self.assertEqual(
            p.date_end,
            datetime.date.today() + datetime.timedelta(weeks=4),
        )
        self.assertEqual(p.is_open, True)

        # Is still open today
        p.date_end = datetime.date.today()
        self.assertEqual(p.is_open, True)

        # Not open yesterday
        p.date_end = datetime.date.today() - datetime.timedelta(days=1)
        self.assertEqual(p.is_open, False)
