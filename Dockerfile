# https://docs.docker.com/reference/dockerfile/
# https://testdriven.io/blog/dockerizing-django-with-postgres-gunicorn-and-nginx/
# https://testdriven.io/blog/django-docker-https-aws/
# https://testdriven.io/blog/django-lets-encrypt/
FROM debian:stable-slim
ARG S6_OVERLAY_VERSION=3.2.0.2
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1

RUN apt update && apt install --no-install-recommends -y adduser
RUN adduser --system --group --home /home/build build
RUN adduser --system --group --home /home/app app

# NB: Do this separately so app changes don't trigger a full reinstall
COPY ./preinstall.sh /
RUN /preinstall.sh -y

# Install init system: https://github.com/just-containers/s6-overlay
RUN apt-get install --no-install-recommends -y xz-utils
ADD https://github.com/just-containers/s6-overlay/releases/download/v${S6_OVERLAY_VERSION}/s6-overlay-noarch.tar.xz /tmp
RUN tar -C / -Jxpf /tmp/s6-overlay-noarch.tar.xz
ADD https://github.com/just-containers/s6-overlay/releases/download/v${S6_OVERLAY_VERSION}/s6-overlay-x86_64.tar.xz /tmp
RUN tar -C / -Jxpf /tmp/s6-overlay-x86_64.tar.xz
ENTRYPOINT ["/init"]

# Fetch requirements
COPY --chown=build ./requirements.txt ./package.json ./package-lock.json /srv/app/
USER build
WORKDIR /srv/app
RUN python3 -m venv . && ./bin/pip install -r requirements.txt && bin/pip cache purge
RUN npm --verbose ci --production && touch node_modules/.package.json && npm cache clean --force

USER root
# NB: Ideally this would exclude docker/
COPY --chown=build . /srv/app
# Include .git repo for populating ./photolith/settings/version.py
COPY --chown=build .git /srv/app/.git

# Copy service configurations
COPY s6-overlay /etc/s6-overlay/

USER build
RUN make
USER root

# Recreate .dockerignore'd directories
RUN mkdir -p /srv/app/db /srv/app/media /srv/app/ingest_root && chown -R app /srv/app/db /srv/app/media /srv/app/ingest_root
VOLUME ["/srv/app/db", "/srv/app/media", "/srv/app/ingest_root"]
RUN mkdir -p /var/lib/dehydrated
VOLUME ["/var/lib/dehydrated"]
