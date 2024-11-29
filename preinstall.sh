#!/bin/sh
set -eu
. /etc/os-release

apt-get $* update

# General build dependencies
apt-get $* --no-install-recommends install make curl git

# Server dependencies
apt-get $* --no-install-recommends install \
    python3-venv python3-wheel \
    libpq-dev libpython3-dev \
    gettext \

# Client dependencies
apt-get $* --no-install-recommends install \
    nodejs npm

# Client web server dependencies
apt-get $* --no-install-recommends install \
    nginx-light dehydrated openssl
