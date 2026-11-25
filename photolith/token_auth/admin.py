from django.contrib import admin, messages
from django.utils.translation import gettext_lazy as _

from .models import ApiToken


@admin.register(ApiToken)
class ApiTokenAdmin(admin.ModelAdmin):
    list_display = ["user", "name", "created_at", "last_used_at"]
    fields = ["user", "name", "created_at", "last_used_at"]
    readonly_fields = ["created_at", "last_used_at"]
    search_fields = ["user__username", "name"]

    def get_readonly_fields(self, request, obj=None):
        """Tokens can't be moved to another user once created"""
        if obj:
            return ["user"] + self.readonly_fields
        return self.readonly_fields

    def save_model(
        self,
        request,
        obj,
        form,
        change,
    ):
        """Generate a key when creating, and show it to the user"""
        key = None if change else obj.generate_key()
        super().save_model(request, obj, form, change)
        if key:
            self.message_user(
                request,
                _("API token key: %(key)s (copy this now, it will not be shown again)")
                % dict(key=key),
                messages.WARNING,
            )
