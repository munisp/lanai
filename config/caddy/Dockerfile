# Custom Caddy edge image. OpenAppSec protects APISIX; Caddy owns TLS, headers,
# compression, and edge request rate limiting.
FROM caddy:2.9-builder@sha256:1609bfce85bd4452a875e4d459f25e602c484b5a36e9c015511b5bdbd3539784 AS builder

RUN xcaddy build \
  --with github.com/mholt/caddy-ratelimit@v0.0.0-20220719152948-b6b3a7f3a3a9

FROM caddy:2.9-alpine@sha256:b4e3952384eb9524a887633ce65c752dd7c71314d2c2acf98cd5c715aaa534f0
RUN apk add --no-cache curl
COPY --from=builder /usr/bin/caddy /usr/bin/caddy
COPY Caddyfile /etc/caddy/Caddyfile
RUN mkdir -p /var/log/caddy /data /config \
  && chown -R caddy:caddy /var/log/caddy /data /config
USER caddy
EXPOSE 80 443 443/udp 2019
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl --fail http://localhost:2019/health || exit 1
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
