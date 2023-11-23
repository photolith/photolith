Direct upload from cameras to Photolith
=======================================

Photolith can be configured to accept direct uploads from cameras.

A new username/password combination first has to be configured using the ``ftp-add-user`` command, see :ref:`advanced/production:Configuration`

Configuring a camera for direct upload
--------------------------------------

The precise options available depends on the camera, but the settings should be approximately:

* **Server type**: ``SFTP``
* **Name**: The photolith address, e.g. ``photolith.website.org``
* **Folder**: The provided FTP username, e.g. ``ftpuser``
* **Username**: The provided FTP username, e.g. ``ftpuser``
* **Password**: The provided FTP password, e.g. ``ftppass``
