# https://testdriven.io/blog/dockerizing-django-with-postgres-gunicorn-and-nginx/
# https://testdriven.io/blog/django-docker-https-aws/
# https://testdriven.io/blog/django-lets-encrypt/

FROM debian:stable-slim
RUN adduser --system --group --home /home/build build && adduser --system --group --home /home/app app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1

# NB: Do this separately so app changes don't trigger a full reinstall
COPY ./preinstall.sh /
RUN /preinstall.sh -y

# Fetch requirements
COPY --chown=build ./requirements.txt ./package.json ./package-lock.json /srv/app/
USER build
WORKDIR /srv/app
RUN python3 -m venv . && ./bin/pip install -r requirements.txt && bin/pip cache purge
RUN npm --verbose ci --production && touch node_modules/.package.json && npm cache clean --force

USER root
COPY --chown=build . /srv/app

# Recreate .dockerignore'd directories
RUN mkdir -p /srv/app/{db,media,ingest_root} && chown -R app /srv/app/{db,media,ingest_root}

USER build
RUN make

USER app
ENTRYPOINT ["/srv/app/docker/wsgi/entrypoint.sh"]
