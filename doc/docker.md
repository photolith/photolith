# Docker based installation

You can use docker-compose to perform a full local installation with:

```
cp docker/env-example docker/.env
# NB: Edit docker/.env to suit your local environment
docker-compose -f docker/compose.yml build && docker-compose -f docker/compose.yml up
```

Initial instances will need to be configured with:

```
docker-compose -f docker/compose.yml exec wsgi /srv/app/manage.py \
    migrate
docker-compose -f docker/compose.yml exec wsgi /srv/app/manage.py \
    createsuperuser --username=admin --email=admin@example.com
```

Username/passwords for cameras can be added with:

```
podman-compose -f docker/compose.yml exec ftpd \
    ftp-add-user FTP_USER FTP_PASS
```
