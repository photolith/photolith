#!/bin/sh
set -eux
INGEST_ROOT="${INGEST_ROOT-/srv/app/ingest_root}"
INGEST_USERDB="/srv/app/db/vsftpd"

USER="${1}"
PASS="${2}"

# Create an initial user database
if [ ! -e "${INGEST_USERDB}.db" ]; then
  db_load -T -t hash -f /dev/null "${INGEST_USERDB}.db"
  chmod 600 -- "${INGEST_USERDB}.db"
fi

# Add user from commandline
printf "${USER}\n${PASS}\n" | db_load -T -t hash "${INGEST_USERDB}.db"

# Make sure every user in the db has a homedir
for u in $(db_dump -p "${INGEST_USERDB}.db" | awk 'NR == 1, /^HEADER=END/ { next } /DATA=END/ { next } { print }' | awk 'NR % 2 { print }'); do
    mkdir -p -- "${INGEST_ROOT}/${u}"
    chown -R ftp -- "${INGEST_ROOT}/${u}"
done
