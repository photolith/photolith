from crispy_forms.helper import FormHelper
from crispy_forms.layout import Submit
from django import forms
from django.utils.translation import gettext as _

from ..models import Project


class ProjectForm(forms.ModelForm):
    def __init__(self, *args, **kwargs):
        super(ProjectForm, self).__init__(*args, **kwargs)
        # https://docs.djangoproject.com/en/4.2/ref/forms/fields/#modelchoicefield
        self.fields["base_user"].empty_label = _("No base axis")
        self.fields["base_user"].required = False
        # https://django-crispy-forms.readthedocs.io/en/latest/api_layout.html
        self.fields["date_end"].widget.input_type = "date"

        # Only show already-selected options, let javascript populate initial values
        if self.instance.id:
            self.fields["individuals"].choices = [
                (i.id, str(i))
                for i in self.instance.individuals.prefetch_related("metachar_set")
            ]
        else:
            self.fields["individuals"].choices = []

        self.helper = FormHelper()
        self.helper.form_id = "project-form"

    class Meta:
        model = Project
        fields = [
            "name",
            "team",
            "individuals",
            "date_end",
            "base_user",
        ]
