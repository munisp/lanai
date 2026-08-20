# Build and keylessly sign as lanai-realm-render:<release-tag>@sha256:<digest>.
FROM alpine:3.20@sha256:d9e853e87e55526f6b2917df91a2115c36dd7c696a35be12163d44e6e2a4b6bc

RUN apk add --no-cache gettext \
  && addgroup -S -g 10001 renderer \
  && adduser -S -D -H -u 10001 -G renderer renderer

USER 10001:10001
WORKDIR /work
