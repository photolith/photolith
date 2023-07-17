import json

from django.utils.html import escape, mark_safe
from django.contrib import admin

from .models import Image, Individual


class IndividualInline(admin.StackedInline):
    model = Individual


@admin.register(Image)
class ImageAdmin(admin.ModelAdmin):
    list_display = ["href", "orig_filename", "created_by", "created_at"]
    fields = ["preview", "href", "orig_filename", "created_by", "created_at"]
    readonly_fields = ["preview", "created_at"]
    inlines = [IndividualInline]

    def preview(self, obj):
        return mark_safe(
            '<img src="%s" style="max-width: 100%%; max-height: 300px;" />'
            % escape(obj.href)
        )

    preview.short_description = "Preview"


@admin.register(Individual)
class IndividualAdmin(admin.ModelAdmin):
    list_display = ["image_href", "slideLabel", "title", "created_by", "created_at"]
    fields = ["image_preview", "image", "created_by", "created_at", "data"]
    readonly_fields = ["image_href", "image", "image_preview", "created_at", "data"]

    def image_href(self, obj):
        return obj.image.orig_filename

    image_href.short_description = "Image"

    def image_preview(self, obj):
        return mark_safe(
            """<script>
            window.addEventListener('DOMContentLoaded', function (event) {
                const elViewer = document.createElement('DIV');
                elViewer.className = 'ph-cropped-viewer';
                elViewer.style.height = '300px';
                elViewer.setAttribute('data-src', '%s');
                elViewer.setAttribute('data-bounding-box', '%s');
                this.append(elViewer);
                window.initCroppedImageViewer(this);
            }.bind(document.currentScript.parentElement))
            </script>
            """
            % (
                obj.image.href.replace("'", "\\'"),
                json.dumps(obj.bounding_box).replace("'", "\\'"),
            )
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
