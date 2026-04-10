from django.forms import ModelForm, HiddenInput

from crispy_forms.helper import FormHelper

from ..models import Annotation


class AnnotationForm(ModelForm):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["comment"].widget.attrs["rows"] = 2
        self.fields["comment"].required = False
        self.helper = FormHelper()
        self.helper.label_class = "col-sm-3"  # or col-lg-2, etc
        self.helper.field_class = "col"  # or col-lg-8, etc
        self.helper.form_class = "form-horizontal"

    class Meta:
        model = Annotation
        fields = [
            "individual",
            "rating",
            "authority",
            "age",
            "comment",
            "axis_poly",
            "project",
        ]
        widgets = {
            "individual": HiddenInput(),
            "project": HiddenInput(),
        }
