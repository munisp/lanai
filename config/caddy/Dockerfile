# Custom Caddy edge image. OpenAppSec protects APISIX; Caddy owns TLS, headers,
# compression, and edge request rate limiting.
FROM caddy:2.9-builder AS builder

RUN xcaddy build \
  --with github.com/mholt/caddy-ratelimit@v0.0.0-20220719152948-b6b3a7f3a3a9

FROM caddy:2.9-alpine
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
