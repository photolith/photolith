from django.forms import ModelForm, HiddenInput

from ..models import Annotation


class AnnotationForm(ModelForm):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["comment"].widget.attrs["rows"] = 2
        self.fields["comment"].required = False

    class Meta:
        model = Annotation
        fields = [
            "individual",
            "rating",
            "age",
            "comment",
            "axis_poly",
            "project",
        ]
        widgets = {
            "axis_poly": HiddenInput(),
            "individual": HiddenInput(),
            "project": HiddenInput(),
        }
