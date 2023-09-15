# Production notes

## Docker-based installation

The docker-compose file can perform a full installation of Photolith.

First create a local configuration environment file with:

```
cp docker/env-example docker/.env
```

Then edit ``docker/.env`` to suit your local environment. See the file for details.

If you want to use PostgreSQL to store data, this will have to be configured first and the details added to the config file.
By default, photolith uses a .sqlite database in a docker volume.

Once configured, ou can then use docker-compose to perform a full local installation with:

```
docker-compose -f docker/compose.yml build && docker-compose -f docker/compose.yml up
```

Volumes are created as part of ``docker/compose.yml``, see there for more details on their purpose.

## Bare metal installation

Currently unsupported, but can be achieved with:

```
git clone https://github.com/photolith/photolith.git /srv/photolith
sudo ./preinstall.sh
make
# Configure gunicorn server
sudo ./install-wsgi.sh
# Configure NGINX w/dehydrated to act as a proxy
sudo ./install-nginx.sh
# Install FTP server (optional)
sudo ./install-ftpd.sh
```

## Configuration

Before being ready for use, database tables should be created with:

```
docker-compose -f docker/compose.yml exec wsgi /srv/app/manage.py \
    migrate
```

In addition, an initial superuser should be created with:

```
docker-compose -f docker/compose.yml exec wsgi /srv/app/manage.py \
    createsuperuser --username=admin --email=admin@example.com
```

Username/passwords for cameras can be added with:

```
podman-compose -f docker/compose.yml exec ftpd \
    ftp-add-user FTP_USER FTP_PASS
```
