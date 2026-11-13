from django.http import JsonResponse

from ..models import UserProfile

from .base import ApiView


class WhoAmIView(ApiView):
    def get(self, *args, **kwargs):
        user = self.request.user
        return JsonResponse(
            dict(
                id=user.id,
                username=user.username,
                permissions=sorted(user.get_all_permissions()),
                authority_level=UserProfile.for_user(user).base_authority_level,
            )
        )
