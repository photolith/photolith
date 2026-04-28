import json

from django.utils.html import escape, mark_safe
from django.utils.translation import gettext_lazy as _
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.models import User

from .models import *


def image_preview_html(href, bounding_box):
    return mark_safe("""<script>
        window.addEventListener('DOMContentLoaded', function (event) {
            const elViewer = document.createElement('DIV');
            elViewer.className = 'ph-cropped-viewer';
            elViewer.style.height = '300px';
            elViewer.setAttribute('data-src', '%s');
            elViewer.setAttribute('data-bounding-box', '%s');
            this.append(elViewer);
            window.initCroppedViewer(this);
        }.bind(document.currentScript.parentElement))
        </script>
        """ % (href.replace("'", "\\'"), bounding_box.replace("'", "\\'")))


class IndividualInline(admin.StackedInline):
    model = Individual


class TeamInline(admin.TabularInline):
    model = Team.users.through
    verbose_name = _("team")
    extra = 0


class UserProfileInline(admin.StackedInline):
    model = UserProfile
    can_delete = False


class UserAuthorityInline(admin.StackedInline):
    model = UserSpeciesAuthority
    can_delete = False


@admin.action(description="Activate / Password reset selected users")
def user_activate(modeladmin, request, queryset):
    from django.contrib.auth.forms import PasswordResetForm

    # Make sure they are is_active first
    for u in queryset:
        u.is_active = True
        u.save()

    # For each, fill in the PasswordResetForm
    for row in queryset.values("email"):
        form = PasswordResetForm(row)
        form.full_clean()
        form.save(
            request=request,
            use_https=request.is_secure(),
        )


# Redefine UserAdmin to include UserProfileInline
class UserAdmin(BaseUserAdmin):
    list_display = ("username", "email", "first_name", "last_name", "is_active")
    actions = [user_activate]

    inlines = [UserProfileInline, UserAuthorityInline, TeamInline]
    fieldsets = (
        (None, {"fields": ("username", "password")}),
        (_("Personal info"), {"fields": ("first_name", "last_name", "email")}),
        (
            _("Permissions"),
            {
                "fields": (
                    "is_active",
                    "is_staff",
                    "is_superuser",
                    "groups",
                ),
            },
        ),
        (_("Important dates"), {"fields": ("last_login", "date_joined")}),
    )
    add_fieldsets = (
        (
            None,
            {
                "classes": ("wide",),
                "fields": ("username", "email", "password1", "password2"),
            },
        ),
        (
            _("Groups"),
            {
                "fields": ("groups",),
            },
        ),
    )


admin.site.unregister(User)
admin.site.register(User, UserAdmin)


@admin.register(Image)
class ImageAdmin(admin.ModelAdmin):
    list_display = ["content", "orig_filename", "created_by", "created_at"]
    fields = ["preview", "content", "orig_filename", "created_by", "created_at"]
    readonly_fields = ["preview", "created_by", "created_at"]
    inlines = [IndividualInline]

    def preview(self, obj):
        return mark_safe(
            '<img src="%s" style="max-width: 100%%; max-height: 300px;" />'
            % escape(obj.content.url)
        )

    preview.short_description = "Preview"

    def save_model(
        self,
        request,
        obj,
        form,
        change,
    ):
        """Force created_by to current user"""
        obj.created_by = request.user
        super().save_model(request, obj, form, change)


@admin.register(Individual)
class IndividualAdmin(admin.ModelAdmin):
    list_display = ["image_content", "slideLabel", "title", "created_by", "created_at"]
    fields = ["image_preview", "image", "created_by", "created_at", "data"]
    readonly_fields = [
        "image_content",
        "image",
        "image_preview",
        "created_by",
        "created_at",
        "data",
    ]

    def image_content(self, obj):
        return obj.image.orig_filename

    image_content.short_description = "Image"

    def image_preview(self, obj):
        return image_preview_html(
            obj.image.content.url,
            json.dumps(obj.bounding_box),
        )

    image_preview.short_description = "Preview"

    def slideLabel(self, obj):
        return obj.data.get("slideLabel", "")

    def title(self, obj):
        return obj.data.get("title", "")

    def data(self, obj):
        return mark_safe(
            "<table><tr>%s</tr></table>"
            % "</tr><tr>".join(
                "<td>%s</td><td>%s</td>" % (k, v) for k, v in obj.data.items()
            )
        )

    def save_model(
        self,
        request,
        obj,
        form,
        change,
    ):
        """Force created_by to current user"""
        obj.created_by = request.user
        super().save_model(request, obj, form, change)


@admin.register(Taxonomy)
class TaxonomyAdmin(admin.ModelAdmin):
    list_display = [
        "identifier",
        "str_en",
        "str_is",
    ]
    list_filter = ["key"]
    fields = [
        "key",
        "identifier",
        "str_en",
        "str_is",
    ]


@admin.register(Annotation)
class AnnotationAdmin(admin.ModelAdmin):
    list_display = [
        "individual",
        "project",
        "age",
        "rating",
        "created_by",
        "created_at",
    ]
    fields = [
        "individual",
        "project",
        "image_preview",
        "age",
        "rating",
        "authority",
        "comment",
        "created_by",
        "created_at",
    ]
    readonly_fields = ["individual", "image_preview", "created_by", "created_at"]

    def image_preview(self, obj):
        return image_preview_html(
            obj.individual.image.content.url,
            json.dumps(obj.individual.bounding_box),
        )

    image_preview.short_description = "Preview"

    def save_model(
        self,
        request,
        obj,
        form,
        change,
    ):
        """Force created_by to current user"""
        obj.created_by = request.user
        super().save_model(request, obj, form, change)


@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin):
    list_display = ["name", "date_end", "created_by", "created_at"]
    fields = [
        "name",
        "team",
        "date_end",
        "individuals",
        "base_user",
        "created_by",
        "created_at",
        "modified_at",
    ]
    readonly_fields = ["individuals", "created_at", "created_by", "modified_at"]

    def save_model(
        self,
        request,
        obj,
        form,
        change,
    ):
        """Force created_by to current user"""
        obj.created_by = request.user
        super().save_model(request, obj, form, change)


@admin.register(Team)
class TeamAdmin(admin.ModelAdmin):
    list_display = ["name"]
    fields = [
        "name",
        "users",
        "created_by",
        "created_at",
        "modified_at",
    ]
    readonly_fields = ["created_at", "created_by", "modified_at"]
    filter_horizontal = ("users",)

    def save_model(
        self,
        request,
        obj,
        form,
        change,
    ):
        """Force created_by to current user"""
        obj.created_by = request.user
        super().save_model(request, obj, form, change)
