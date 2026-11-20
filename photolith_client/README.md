# photolith-client

A Python client for the Photolith API, e.g. for batch-import tools. See
`doc/advanced/api.rst` in the Photolith repository for the API itself.

It depends only on [requests](https://requests.readthedocs.io/), and is
independent of the rest of the Photolith codebase. Install with:

    pip install "photolith-client @ git+https://github.com/photolith/photolith.git@main#subdirectory=photolith_client"

## Usage

Create an API token for the user doing the import, via the admin interface or
`./manage.py create_api_token <username>`, then:

```python
from photolith_client import PhotolithClient, Conflict

client = PhotolithClient("https://photolith.example.com", "0123456789abcdef")
print(client.whoami())

image = client.upload_image(
    "GHL_2024_0012.jpg", scale_line=[[10, 950], [410, 950]], scale_mm=5,
)

# Individuals are matched to any existing ones by ch_slideLabel & ch_individualLabel
out = client.sync_individuals(image["id"], [
    dict(bounding_box=[[0, 0], [100, 100]],
         data=dict(ch_slideLabel="12", ch_individualLabel="3", tx_species={"id": 1})),
    dict(bounding_box=[[110, 0], [210, 100]],
         data=dict(ch_slideLabel="12", ch_individualLabel="4")),
])
ind_id = out["ids"][0]

ann = client.create_annotation(
    ind_id, age=7, rating="1", authority=20, axis_poly=[[50, 50], [90, 20]],
)

rows = client.search(nm_image_id=image["id"], with_annotations="all")
```

| Method | Endpoint |
| --- | --- |
| `whoami()` | `GET /api/v1/whoami/` |
| `upload_image(path_or_file, scale_line=, scale_mm=)` | `POST /api/v1/images/`, then `PATCH` if a scale is given |
| `get_image(id)` | `GET /api/v1/images/<id>/` |
| `set_image_scale(id, scale_line=, scale_mm=)` | `PATCH /api/v1/images/<id>/` |
| `get_individuals(image_id)` | `GET /api/v1/images/<id>/individuals/` |
| `put_individuals(image_id, entries, if_match=)` | `PUT /api/v1/images/<id>/individuals/` |
| `sync_individuals(image_id, entries, delete_missing=)` | `GET` then `PUT`, matching by labels |
| `update_individual(id, bounding_box=, data=)` | `PATCH /api/v1/individuals/<id>/` |
| `delete_individual(id)` | `DELETE /api/v1/individuals/<id>/` |
| `search(**filters)` | `GET /search/data/` |
| `create_annotation(individual_id, ...)` | `POST /api/v1/individuals/<id>/annotations/` |
| `delete_annotation(id)` | `DELETE /api/v1/annotations/<id>/` |

### Errors

Error responses raise a `PhotolithError` subclass, with `status`,
`error_class`, `error` and the decoded `body`:

* `ValidationError` (400), with per-field errors in `fields`
* `Unauthorized` (401)
* `PermissionDenied` (403)
* `NotFound` (404)
* `Conflict` (409), with the IDs of the annotations in the way in `annotations`
* `PreconditionFailed` (412)
* `SearchTruncated`, when `search()` has too many results to return

### Search filters

`search()` filters are the same as the search form:

* `nm_` / `in_` / `dt_` filters are ranges: a single value is an exact match,
  `(min, max)` is a range, with `None` for an open end.
* Other filters can be a single value or a list, where any value matches.
* `True` flags (e.g. `with_associated_images=True`) are sent as `1`.

## Tests

The tests are part of the Photolith test suite, as they need a server, see
`photolith/tests/test_photolith_client.py`.
