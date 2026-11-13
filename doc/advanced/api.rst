Photolith API
=============

Conventions
-----------

* All endpoints live under ``/api/v1/``.
* Authenticate with a per-user API token, issued via the admin interface or ``./manage.py create_api_token <username>``::

    Authorization: Token 0123456789abcdef

  This works for any Photolith URL, including ``/search/data/``. The user's existing permissions apply.
  An unknown token returns ``401``, rather than redirecting to the login page.
* Request & response bodies are JSON, except for image upload.
* Status codes: ``200`` OK, ``201`` created, ``400`` invalid input, ``401`` bad token, ``403`` forbidden, ``404`` not found, ``409`` conflict, ``412`` precondition failed.
* Errors use the same shape as existing JSON views, plus per-field errors when a form fails validation (e.g. annotations):

  .. code-block:: json

    {"error_class": "ValidationError", "error": "Age reading: Enter a whole number.",
     "fields": {"age": ["Enter a whole number."]}}

Bounding boxes, scale lines & axis polygons are ``[[x, y], ...]`` arrays in image pixel co-ordinates, as stored by the web client.

Individual metadata uses the same type-prefixed keys as the ingest form: ``ch_`` (text), ``nm_`` (number), ``in_`` (integer), ``dt_`` (date/time), ``tx_`` (taxonomy, e.g. ``{"id": 1}``).

Who am I
--------

``GET /api/v1/whoami/``: Check a token & what it can do before starting a batch:

.. code-block:: json

    {"id": 4, "username": "jbloggs",
     "permissions": ["photolith.add_image", "photolith.add_individual"],
     "authority_level": 80}

Images
------

``POST /api/v1/images/``: Upload an image (requires ``add_image``), the request body is the raw file::

    Content-Type: image/jpeg
    X-Photolith-Filename: GHL_2024_0012.jpg      (URI-encoded)

Images are stored by content hash, so uploading the same file twice returns the existing image (``200`` rather than ``201``, ``created`` is false):

.. code-block:: json

    {"id": 812, "content": "image_content/ab12...ef.jpg", "orig_filename": "GHL_2024_0012.jpg",
     "mimetype": "image/jpeg", "scale_line": null, "scale_mm": null, "created_by": 4,
     "created": true}

``GET /api/v1/images/<id>/``: Fetch an image object (requires ``view_image``), as above without ``created``.

``PATCH /api/v1/images/<id>/``: Set the image's scale. Requires ``add_individual``, as when setting the scale whilst ingesting. Keys not given are left alone, ``null`` clears:

.. code-block:: json

    {"scale_line": [[10, 950], [410, 950]], "scale_mm": 5}

Individuals on an image
-----------------------

``GET /api/v1/images/<id>/individuals/``: All individuals on an image:

.. code-block:: json

    {"image_id": 812,
     "individuals": [
       {"id": 5531, "bounding_box": [[0, 0], [100, 100]],
        "num_annotations": 1, "dt_created_at": "...", "dt_modified_at": "...",
        "data": {"ch_slideLabel": "12", "ch_individualLabel": "3", "tx_species": {"id": 1}}},
       {"id": 5532, "bounding_box": [[110, 0], [210, 100]],
        "num_annotations": 0, "dt_created_at": "...", "dt_modified_at": "...",
        "data": {"ch_slideLabel": "12", "ch_individualLabel": "5"}}
     ]}

The response includes an ``ETag`` header.

``PUT /api/v1/images/<id>/individuals/``: Replace the full set of individuals on an image. Every existing individual must be included by ``id``, either to update it, or with a ``null`` bounding box to delete it. Entries without an ``id`` create new individuals:

.. code-block:: json

    {"individuals": [
       {"id": 5531, "bounding_box": [[0, 0], [100, 100]],
        "data": {"ch_slideLabel": "12", "ch_individualLabel": "3", "nm_length": 35.0}},
       {"id": 5532, "bounding_box": null},
       {"bounding_box": [[220, 0], [320, 100]],
        "data": {"ch_slideLabel": "12", "ch_individualLabel": "4", "tx_species": {"id": 1}}}
     ]}

A newly uploaded image has no individuals, so can be PUT to straight away. Otherwise (e.g. the upload returned ``"created": false``, as the image already existed), GET the image's individuals first, and match them to your own records (e.g. by ``ch_slideLabel`` & ``ch_individualLabel``) to find their IDs. Leaving any out returns ``400``, rather than deleting them.

Within an image, individuals are identified to people by the combination of ``ch_slideLabel`` & ``ch_individualLabel``, e.g. individual ``3`` can be on more than one slide. So every entry not being deleted must have both labels, and the combination cannot repeat within the request. Labels can be changed, as the ``id`` identifies the individual.

Each entry's ``data`` replaces that individual's metadata, keys not given are removed.

The update is all-or-nothing: if any entry is invalid, nothing is saved. Errors, and the rest of the response, refer to entries by their position in the request, e.g. ``"fields": {"individuals[1].data.tx_species": [...]}``. Existing individuals missing from the request are reported in ``"fields": {"individuals": [...]}``.

The API never deletes annotations as a side-effect. If the update would change the bounding box of, or remove, an individual with annotations, nothing is saved and ``409`` is returned, listing annotation IDs by entry. The client is responsible for deleting these annotations first (see below), and if it cannot, it should not be changing those individuals:

.. code-block:: json

    {"error_class": "Conflict", "error": "3 annotations would be invalidated",
     "annotations": {"individuals[0]": [9001], "individuals[1]": [9010, 9011]}}

Send the ``ETag`` from a previous GET as ``If-Match`` to get ``412`` instead of overwriting changes made since.

On success, the response is the same as GET, plus the individual IDs changed by each entry, including those created:

.. code-block:: json

    {"image_id": 812,
     "individuals": ["...full list..."],
     "created": {"individuals[2]": 5533}, "updated": {"individuals[0]": 5531},
     "deleted": {"individuals[1]": 5532}}

``PATCH /api/v1/individuals/<id>/``: Update a single individual, ``<id>`` is the individual's ID from the GET / PUT responses above. ``data`` is merged with existing metadata:

.. code-block:: json

    {"bounding_box": [[0, 0], [120, 100]], "data": {"nm_length": 35.0}}

Changing the bounding box of an individual with annotations returns ``409``, as above, but ``annotations`` is a list of IDs, e.g. ``[9001]``. Changing the labels to those of another individual on the image returns ``400``.

``DELETE /api/v1/individuals/<id>/``: Delete an individual. Returns ``409``, as PATCH, if it has annotations.

Finding individuals
-------------------

Use the existing ``/search/data/`` endpoint, which accepts API tokens. Filters are the same as the search form, e.g::

    GET /search/data/?nm_image_id=812&nm_image_id=812               # Individuals on image 812
    GET /search/data/?ch_slideLabel=12&ch_individualLabel=3         # Exact match on metadata
    GET /search/data/?ch_slideLabel=12&ch_slideLabel=13             # Multiple values match either
    GET /search/data/?nm_image_id=812&nm_image_id=812&with_annotations=all   # One row per annotation

``nm_`` / ``in_`` / ``dt_`` filters are ranges, so give the same value twice for an exact match. Add ``with_associated_images=1`` to include ``image_id`` in each row. Metadata is flattened into each row, rather than nested under ``data``:

.. code-block:: json

    {"data": [
       {"id": 5531, "dt_created_at": "...", "dt_modified_at": "...",
        "ch_slideLabel": "12", "ch_individualLabel": "3", "tx_species": {"id": 1},
        "__str__": "12 : 3", "bounding_box": [[0, 0], [100, 100]], "num_annotations": 1}
     ]}

With ``with_annotations``, each row also includes ``annotation_id`` (for e.g. ``DELETE /api/v1/annotations/<id>/``) and ``project_id`` (``null`` for annotations not in a project), both ``null`` for individuals without annotations. ``rating`` is returned as stored (``100``/``50``/``0`` for ``"1"``/``"2"``/``"3"``).

``num_annotations`` only counts annotations in the ``project`` searched, or without one, annotations not in any project. Use ``num_annotations`` from ``GET /api/v1/images/<id>/individuals/`` for the total, e.g. before a PUT.

Clients should check the response for:

* ``alert``: More than ``SEARCH_RESULT_MAX_ROWS`` results, the list is truncated.
* ``error_class`` / ``error``: An error occurred part-way through. The status code will still be ``200``.

Annotations
-----------

``POST /api/v1/individuals/<id>/annotations/``: Add an annotation, ``<id>`` is the individual's ID from the GET / PUT responses above:

.. code-block:: json

    {"age": 7, "rating": "1", "authority": 20, "comment": "",
     "axis_poly": [[50, 50], [90, 20]], "project": null}

Returns ``201``:

.. code-block:: json

    {"id": 9001, "individual_id": 5531, "created_by": "jbloggs",
     "age": 7, "rating": "1", "authority": 20, "comment": "",
     "axis_poly": [[50, 50], [90, 20]], "project": null,
     "created_at": "...", "modified_at": "..."}

Validation is as per the annotate form: ``authority`` cannot exceed the user's own level, and ``project`` must be open. Use ``authority: 20`` ("Automated reader") for machine-generated readings.

``rating`` uses the official notation: ``"1"`` (good), ``"2"`` (difficult) or ``"3"`` (unreadable).

``DELETE /api/v1/annotations/<id>/``: Delete an annotation. Only the owner (or a superuser) can do this.
