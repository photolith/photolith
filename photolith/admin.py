import json

from django.utils.html import escape, mark_safe
from django.utils.translation import gettext_lazy as _
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.models import User

from .models import UserProfile, Image, Individual, Annotation, Project


def image_preview_html(href, bounding_box):
    return mark_safe(
        """<script>
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
        """
        % (href.replace("'", "\\'"), bounding_box.replace("'", "\\'"))
    )


class IndividualInline(admin.StackedInline):
    model = Individual


class UserProfileInline(admin.StackedInline):
    model = UserProfile
    can_delete = False


# Redefine UserAdmin to include UserProfileInline
class UserAdmin(BaseUserAdmin):
    inlines = [UserProfileInline]
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
    readonly_fields = ["preview", "created_at"]
    inlines = [IndividualInline]

    def preview(self, obj):
        return mark_safe(
            '<img src="%s" style="max-width: 100%%; max-height: 300px;" />'
            % escape(obj.content.url)
        )

    preview.short_description = "Preview"


@admin.register(Individual)
class IndividualAdmin(admin.ModelAdmin):
    list_display = ["image_content", "slideLabel", "title", "created_by", "created_at"]
    fields = ["image_preview", "image", "created_by", "created_at", "data"]
    readonly_fields = ["image_content", "image", "image_preview", "created_at", "data"]

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


@admin.register(Annotation)
class AnnotationAdmin(admin.ModelAdmin):
    list_display = ["individual", "age", "rating", "created_by", "created_at"]
    fields = [
        "individual",
        "image_preview",
        "age",
        "rating",
        "comment",
        "created_by",
        "created_at",
    ]
    readonly_fields = ["individual", "image_preview", "created_at"]

    def image_preview(self, obj):
        return image_preview_html(
            obj.individual.image.content.url,
            json.dumps(obj.individual.bounding_box),
        )

    image_preview.short_description = "Preview"


@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin):
    list_display = ["name", "date_end", "created_by", "created_at"]
    fields = [
        "name",
        "date_end",
        "search_qs",
        "base_user",
        "created_by",
        "created_at",
        "modified_at",
    ]
    readonly_fields = ["created_at", "modified_at"]
