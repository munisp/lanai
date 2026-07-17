# =============================================================================
# Custom Caddy Build — Lanai Platform Edge Gateway
# Plugins included:
#   - caddy-security:   OIDC/OAuth2/JWT authentication (Keycloak integration)
#   - caddy-ratelimit:  Advanced rate limiting with zone support
#   - caddy-waf:        OWASP-based Web Application Firewall rules
# =============================================================================

# Stage 1: Build custom Caddy with plugins using xcaddy
FROM caddy:2.9-builder AS builder

RUN xcaddy build \
    --with github.com/greenpau/caddy-security@v1.1.32 \
    --with github.com/mholt/caddy-ratelimit@v0.0.0-20220719152948-b6b3a7f3a3a9 \
    --with github.com/fabriziosalmi/caddy-waf@v0.0.0-20250101000000-000000000000

# Stage 2: Production image
FROM caddy:2.9-alpine

# Install curl for health checks
RUN apk add --no-cache curl

# Copy the custom Caddy binary
COPY --from=builder /usr/bin/caddy /usr/bin/caddy

# Copy Caddyfile
COPY Caddyfile /etc/caddy/Caddyfile

# Create log directory
RUN mkdir -p /var/log/caddy && chown -R caddy:caddy /var/log/caddy

# Create data and config directories with correct permissions
RUN mkdir -p /data /config && chown -R caddy:caddy /data /config

# Run as non-root caddy user
USER caddy

# Expose HTTP, HTTPS, and admin/metrics ports
EXPOSE 80 443 443/udp 2019

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:2019/health || exit 1

CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
