from . import UNSET

# Individuals are identified to people by these within an image
LABELS = ("ch_slideLabel", "ch_individualLabel")


def labels(data):
    """(ch_slideLabel, ch_individualLabel) of an individual's data"""
    return tuple(data.get(k) for k in LABELS)


class IndividualsMixin:
    """/api/v1/images/<id>/individuals/ & /api/v1/individuals/ endpoints, for use with PhotolithClient"""

    def get_individuals(self, image_id):
        """All individuals on an image. The result's etag can be given to put_individuals()"""
        return self.request("GET", "/api/v1/images/%d/individuals/" % image_id)

    def put_individuals(self, image_id, individuals, if_match=None):
        """
        Replace the full set of individuals on an image, see api.rst. Each
        entry is {id, bounding_box, data}:

        * Every existing individual must be included by id
        * Entries without an id create new individuals
        * A None bounding_box deletes the individual
        * data replaces the individual's metadata

        Give an etag from get_individuals() as if_match to raise
        PreconditionFailed rather than overwriting changes made since.
        """
        return self.request(
            "PUT",
            "/api/v1/images/%d/individuals/" % image_id,
            json=dict(individuals=individuals),
            headers={"If-Match": if_match} if if_match else {},
        )

    def sync_individuals(self, image_id, individuals, delete_missing=False):
        """
        Create / update individuals on an image, as put_individuals(), but
        entries without an id are matched to existing individuals by
        ch_slideLabel & ch_individualLabel.

        Existing individuals not in individuals are deleted if delete_missing,
        otherwise left alone.

        Returns the put_individuals() result, plus "ids", the individual ID of
        each entry in individuals (None if deleted).
        """
        current = self.get_individuals(image_id)
        existing = {labels(ind["data"]): ind for ind in current["individuals"]}

        entries = []
        used_ids = set()
        for entry in individuals:
            entry = dict(entry)
            if "id" not in entry:
                ind = existing.get(labels(entry.get("data", {})))
                if ind and ind["id"] not in used_ids:
                    entry["id"] = ind["id"]
            if "id" in entry:
                used_ids.add(entry["id"])
            entries.append(entry)
        for ind in current["individuals"]:
            if ind["id"] in used_ids:
                continue
            if delete_missing:
                entries.append(dict(id=ind["id"], bounding_box=None))
            else:
                entries.append(
                    dict(
                        id=ind["id"], bounding_box=ind["bounding_box"], data=ind["data"]
                    )
                )

        out = self.put_individuals(image_id, entries, if_match=current.etag)
        changed = dict(out["created"], **out["updated"])
        out["ids"] = [
            changed.get("individuals[%d]" % i) for i in range(len(individuals))
        ]
        return out

    def update_individual(self, individual_id, bounding_box=UNSET, data=UNSET):
        """
        Update a single individual. data is merged with existing metadata.
        Returns the updated individual
        """
        body = {}
        if bounding_box is not UNSET:
            body["bounding_box"] = bounding_box
        if data is not UNSET:
            body["data"] = data
        return self.request(
            "PATCH", "/api/v1/individuals/%d/" % individual_id, json=body
        )

    def delete_individual(self, individual_id):
        """Delete an individual, raising Conflict if it has annotations"""
        self.request("DELETE", "/api/v1/individuals/%d/" % individual_id)
