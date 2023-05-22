#!/bin/sh
set -eu
. /etc/os-release

# Add APT source for node
cat <<EOF > /etc/apt/sources.list.d/nodesource.list
# curl -fsSL https://deb.nodesource.com/gpgkey/nodesource.gpg.key -o /usr/share/keyrings/nodesource.asc
deb [signed-by=/usr/share/keyrings/nodesource.asc] https://deb.nodesource.com/node_18.x ${VERSION_CODENAME} main
deb-src [signed-by=/usr/share/keyrings/nodesource.asc] https://deb.nodesource.com/node_18.x ${VERSION_CODENAME} main
EOF
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource.gpg.key -o /usr/share/keyrings/nodesource.asc
apt update

# Server dependencies
apt install \
    python3-venv python3-wheel \
    libpq-dev libpython3-dev \

# Client dependencies
apt install \
    nodejs
