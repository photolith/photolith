from django.forms import ModelForm, HiddenInput

from ..models import Annotation


class AnnotationForm(ModelForm):
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
