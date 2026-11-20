class AnnotationsMixin:
    """/api/v1/individuals/<id>/annotations/ & /api/v1/annotations/ endpoints, for use with PhotolithClient"""

    def create_annotation(
        self,
        individual_id,
        *,
        age,
        rating,
        authority,
        axis_poly,
        comment="",
        project=None,
    ):
        """
        Add an annotation to an individual, returning the annotation.

        * rating: The official notation, "1" (good), "2" (difficult) or "3" (unreadable)
        * authority: Can't exceed the user's own level, use 20 ("Automated
          reader") for machine-generated readings
        * project: Project ID, or None for a general annotation
        """
        return self.request(
            "POST",
            "/api/v1/individuals/%d/annotations/" % individual_id,
            json=dict(
                age=age,
                rating=str(rating),
                authority=authority,
                comment=comment,
                axis_poly=axis_poly,
                project=project,
            ),
        )

    def delete_annotation(self, annotation_id):
        """Delete an annotation. Only the owner (or a superuser) can do this"""
        self.request("DELETE", "/api/v1/annotations/%d/" % annotation_id)
