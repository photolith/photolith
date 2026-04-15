Development notes
=================

Installation
------------

Check out the repository, install rerequisites and build source::

    git clone https://github.com/photolith/photolith.git /srv/photolith
    sudo ./preinstall.sh
    make

You can start a development server with::

    make start APP_ALLOWED_HOSTS="yourhostname" APP_SECRET_KEY="insecure-secret" APP_DEBUG=True

If you prefer, you can make a ``photolith/settings/local.py`` overriding settings, rather than specifying them in environment variables.

You can re-build just the clientside javascript with::

    npm run build

Other commands are as with any other Django project, e.g::

* ``./manage.py test``: Run unit tests
* ``./manage.py makemigrations``: Make any migrations required by database changes
* ``./manage.py migrate``: Apply database changes

Using docker container as a front-end
-------------------------------------

You can use the production configuration of docker as a front-end to your development server by setting the ``DOCKER_WSGI_PORT`` variable.
This will disable the docker container's gunicorn process, and Nginx will connect to your development server.
See ``env.example`` for more details.

Precommit checks
----------------

Before committing any code, you should run ``make precommit`` to:

* Check all code formatting
* Ensure translation files are up-to-date

For example: ``make precommit && git add -p``.
