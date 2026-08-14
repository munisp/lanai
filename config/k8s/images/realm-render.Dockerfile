# Build and sign as lanai-realm-render:<immutable-digest>.
FROM alpine:3.20
RUN apk add --no-cache gettext \
  && addgroup -S -g 10001 renderer \
  && adduser -S -D -H -u 10001 -G renderer renderer
USER 10001:10001
WORKDIR /work
