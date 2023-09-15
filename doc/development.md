# Development notes

## Installation

Check out the repository, install rerequisites and build source:

```
git clone https://github.com/photolith/photolith.git /srv/photolith
sudo ./preinstall.sh
make
```

You can start a development server with:

```
make start APP_ALLOWED_HOSTS="yourhostname" APP_SECRET_KEY="insecure-secret" APP_DEBUG=True
```

If you prefer, you can make a ``photolith/settings/local.py`` overriding settings, rather than specifying them in environment variables.

You can re-build just the clientside javascript with:

```
npm run build
```

Other commands are as with any other Django project, e.g:

* ``./manage.py test``: Run unit tests
* ``./manage.py makemigrations``: Make any migrations required by database changes
* ``./manage.py migrate``: Apply database changes

## Precommit checks

Before committing any code, you should run ``make precommit`` to:

* Check all code formatting
* Ensure translation files are up-to-date

For example: ``make precommit && git add -p``.
