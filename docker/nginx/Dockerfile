FROM debian:stable-slim

RUN apt-get -y update && apt-get -y install --no-install-recommends nginx-light dehydrated openssl

COPY entrypoint.sh /entrypoint.sh
CMD ["/entrypoint.sh"]
