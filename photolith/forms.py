from django.forms import ModelForm, HiddenInput

from .models import Annotation


class AnnotationForm(ModelForm):
    class Meta:
        model = Annotation
        fields = [
            "rating",
            "age",
            "comment",
            "bisect_poly",
        ]
        widgets = {"bisect_poly": HiddenInput()}
