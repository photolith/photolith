from django.shortcuts import render
from django.utils.translation import ngettext
from django.utils.translation import gettext as _
from django.views.generic import TemplateView


class IndexView(TemplateView):
    template_name = "ingest/index.html"

    def image_sources(self):
        def count_string(count):
            return ngettext("(%(count)d photo)", "(%(count)d photos)", count) % dict(
                count=count,
            )

        yield dict(name="fileselect:", description=_("Upload file from computer"))

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["image_sources"] = self.image_sources()
        return context
