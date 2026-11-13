from django.contrib.auth import get_user_model
from django.test import TestCase

from ..models import Taxonomy, UserSpeciesAuthority

from .requires_utils import RequiresUtils


class CreateUserTest(RequiresUtils, TestCase):
    def test_base_authority_level(self):
        def saved_level(user):
            # NB: Fetch afresh, so we see what's in the DB, not the in-memory profile
            return (
                get_user_model()
                .objects.get(pk=user.pk)
                .userprofile.base_authority_level
            )

        # Non-default level saved
        user = self.create_user(
            base_authority_level=UserSpeciesAuthority.AuthorityLevel.EXPERT
        )
        self.assertEqual(saved_level(user), UserSpeciesAuthority.AuthorityLevel.EXPERT)

        # ...alongside any species authority
        Taxonomy.objects.create(
            key="species", identifier=100, str_en="Fish", str_is="Fiskur"
        )
        user = self.create_user(
            base_authority_level=UserSpeciesAuthority.AuthorityLevel.JUNIOR,
            species_authority=[
                ("Fish", UserSpeciesAuthority.AuthorityLevel.SENIOR_EXPERT)
            ],
        )
        self.assertEqual(saved_level(user), UserSpeciesAuthority.AuthorityLevel.JUNIOR)
        self.assertEqual(
            user.userprofile.authority_level(dict(tx_species=dict(id=100))),
            UserSpeciesAuthority.AuthorityLevel.SENIOR_EXPERT,
        )

        # No level given, no profile
        user = self.create_user()
        self.assertFalse(
            hasattr(get_user_model().objects.get(pk=user.pk), "userprofile")
        )
