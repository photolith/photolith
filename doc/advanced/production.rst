Production notes
================

Docker-based installation
-------------------------

The docker-compose file can perform a full installation of Photolith.

First create a local configuration environment file with::

    cp env.example .env

Then edit ``.env`` to suit your local environment. See the file for details.


Once configured, ou can then use docker-compose to perform a full local installation with::

    docker compose build && docker-compose up

Volumes are created as part of ``docker/compose.yml``, see there for more details on their purpose.

Postgresql database
-------------------

By default, photolith uses a .sqlite database in a docker volume. However, postgres is also supported.

First set up a postgres instance, or install one locally with ``apt install postgresql``.

You may need to add an entry into ``/etc/postgresql/17/main/pg_hba.conf``, for instance::

    hostssl photolith_db    photolith_user  all             scram-sha-256

Login and create a photolith user, for instance with ``sudo -u postgres psql``::

    CREATE DATABASE photolith_db;
    CREATE USER photolith_user WITH ENCRYPTED PASSWORD 'photolith_pw';
    ALTER ROLE photolith_user SET client_encoding TO 'utf8';
    ALTER ROLE photolith_user SET default_transaction_isolation TO 'read committed';
    ALTER ROLE photolith_user SET timezone TO 'UTC';
    GRANT ALL PRIVILEGES ON DATABASE photolith_db TO photolith_user;
    \connect photolith_db
    GRANT ALL PRIVILEGES ON SCHEMA public TO photolith_user;

Then edit ``.env`` to enable the postgresql configuration, using the details as above.

Configuration
-------------

Before being ready for use, database tables should be created with::

    docker compose exec -uapp photolith /srv/app/manage.py migrate

In addition, an initial superuser should be created with::

    docker compose exec -uapp photolith /srv/app/manage.py \
        createsuperuser --username=admin --email=admin@example.com

dehydrated is configured to generate SSL certs, before use you need to accept their terms::

    docker compose exec photolith dehydrated --register --accept-terms

And then on a ~weekly basis the following needs to run::

    docker compose exec photolith dehydrated -c

User accounts for the FTP server can be added with::

    docker compose exec -uroot photolith /srv/app/photolith/ftp-add-user.sh \
        user password
