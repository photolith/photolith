Taxonomies
==========

Taxonomies, are translated restricted lists of values, for example *sex*, *species*.

When ingesting or searching, you will get a drop-down list to choose from existing values.

Adding manual entries
---------------------

By default these are populated by API calls when ingesting new values.
If the API provides a value not yet known by photolith, it will be added.
However, an administrator can add new choices themselves

#. Go to the `"Taxonomies" section in site administration </admin/photolith/taxonomy/>`_
#. Press "+ Add"
#. The "Metadata key" must exactly match another member in the taxonomy (e.g. "species"), and should not start with a capital letter for example
#. The "Identifier" should be a unique number within the "Metadata key". A ``1`` for "species" and a ``1`` for "sex" is fine, but ``1`` cannot be repeated within "species".
#. Enter a text name along with any translations.
#. Press "SAVE"

The new taxonomy values should be now be available in the ingest page.
