FROM debian:stable-slim

RUN apt-get -y update && apt-get -y install --no-install-recommends vsftpd db-util

COPY entrypoint.sh ftp-* /bin
CMD ["/bin/entrypoint.sh"]
