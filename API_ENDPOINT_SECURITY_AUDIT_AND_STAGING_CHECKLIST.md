# API Endpoint Security Audit and Staging Checklist

**Scope:** This review covers the portal HTTP entry point, the dedicated metrics listener, Caddy, APISIX, public webhook/callback exceptions, and the staging validation required after the `4e966cb` dedicated-metrics change and its follow-on hardening.

## Executive Disposition

The portal now separates application traffic from metrics traffic. The public-facing application listener is port `3001`; the count-only Prometheus listener is port `9464`. The historical `/api/metrics` route returns `404` at the application and Caddy layers. Kubernetes ingress policy permits port `9464` only from namespaces labelled `lanai.io/monitoring=true`.

The audit also removed the public APISIX route to `/internal/ai/*` and introduced AI gateway ingress and egress isolation. The unauthenticated health response was reduced to a minimal readiness signal. These controls are validated locally and structurally; their effective enforcement requires a staging Kubernetes cluster with CNI NetworkPolicy support and the shared APISIX controller.

## Endpoint Exposure Matrix

| Surface | Exposure model | Current control | Residual staging evidence |
|---|---|---|---|
| `GET /api/health` on port `3001` | Probe/edge reachable | Returns only `{ "status": "ok" }` or `{ "status": "unavailable" }`; no version, environment, timestamp, database detail, or stack trace | Verify exact response through each ingress hostname and direct Service route |
| `GET /api/metrics` on port `3001` | Retired | Explicit application `404`; Caddy returns `404` before proxying | Verify `404` from portal Service, APISIX hosts, and Caddy hosts |
| `GET /metrics` on port `9464` | Monitoring-only | Count-only financial outbox gauges; NetworkPolicy allows only `lanai.io/monitoring=true` namespaces | Verify Prometheus scrape succeeds and an unlabelled test Pod is denied |
| `/api/trpc/*` | Portal API | tRPC context plus fail-closed Permify authorization for protected procedures | Execute authenticated and unauthorized procedure checks |
| `/api/proposals/*`, `/api/intelligence/*`, `/api/briefing/*`, `/api/whatsapp/api/*` | Advisor API | Keycloak authentication plus `manage platform:lanai` Permify check | Verify 401/403 before the AI gateway and successful authorized invocation |
| `/crm/*` | Advisor proxy | Advisor authentication; server-side Twenty token never returned | Verify anonymous request is denied and response headers do not expose credentials |
| `/storage/*`, `/chatwoot/*` | Authenticated proxy | Route-specific authentication middleware | Verify anonymous denial and upstream error sanitization |
| `/api/oauth/*` | Public identity transition | Auth limiter and OIDC callback state validation | Verify invalid/expired state is rejected without token leakage |
| `/api/stripe/webhook` | Public provider callback | Raw body before JSON parser; Stripe signature verification | Verify unsigned/invalid request is rejected and valid sandbox event is durable |
| `/api/crm/twenty/webhook` | Public provider callback | Raw body before JSON parser; Twenty webhook validation | Verify unsigned/invalid request is rejected in the configured provider environment |
| `/webhook/whatsapp` | Public provider callback | Terminates at external WhatsApp bridge, not portal | Obtain bridge signature-validation evidence from staging owner |
| `/internal/ai/*` through API host | Retired public internal route | APISIX rule removed; AI gateway has no public ingress route | Verify ingress returns no route and direct gateway connection is limited to portal Pods |

## Repository-Controlled Hardening Applied

The main application endpoint uses the following explicit retired-route guard:

```ts
app.get("/api/metrics", (_req, res) => res.status(404).end());
```

The metrics listener is separate and produces fixed-label, count-only values:

```ts
metricsApp.get("/metrics", async (_req, res) => {
  // SELECT status, count(*) FROM outbox_events
  // WHERE aggregateType = 'financial' GROUP BY status
});
```

The portal NetworkPolicy limits metrics ingress to the monitoring namespace label:

```yaml
- from:
    - namespaceSelector:
        matchLabels:
          lanai.io/monitoring: "true"
  ports:
    - protocol: TCP
      port: 9464
```

The AI gateway is isolated with `lanai-ai-gateway-ingress`, allowing only Pods labelled `app=lanai-portal` to TCP `8100`, and `lanai-ai-gateway-egress`, allowing only Ollama TCP `11434` and kube-dns TCP/UDP `53`.

## Staging Prerequisites

| Prerequisite | Required evidence |
|---|---|
| Immutable portal image | Digest references a build containing `4e966cb` and the follow-on API hardening changes |
| Kubernetes tooling | Approved kubeconfig, `kubectl`, `kustomize`, and server-side dry-run permission |
| Monitoring namespace | Namespace carrying `lanai.io/monitoring=true`; Prometheus Pod deployed there |
| CNI enforcement | Staging CNI enforces Kubernetes `NetworkPolicy` for ingress and egress |
| APISIX reconciliation | Shared APISIX controller has accepted the updated `ApisixRoute`; no stale `/internal/ai/*` route remains |
| Prometheus | Target updated to `lanai-portal:9464`, path `/metrics`, and financial alert rule mounted |
| Alertmanager | Rendered receiver configuration passes `amtool check-config`; Prometheus points at the approved Alertmanager target |
| Gateway secrets | Keycloak smoke secret, Permify relation, Stripe sandbox secrets, CRM test secret, and Dapr/financial test secrets are provisioned externally |

## Deployment and Validation Sequence

1. Confirm the target revision and render the overlay locally:

   ```bash
   git rev-parse --verify 4e966cb
   kustomize build config > /tmp/lanai-rendered.yaml
   kubectl --context "$LANAI_STAGING_CONTEXT" apply \
     --server-side --dry-run=server --validate=strict \
     -f /tmp/lanai-rendered.yaml
   ```

2. Apply only through the approved deployment controller or reviewed server-side apply flow. Confirm APISIX and Deployment rollout status:

   ```bash
   kubectl --context "$LANAI_STAGING_CONTEXT" -n lanai rollout status deploy/lanai-portal
   kubectl --context "$LANAI_STAGING_CONTEXT" -n lanai rollout status deploy/lanai-ai-gateway
   kubectl --context "$LANAI_STAGING_CONTEXT" -n lanai get apisixroute lanai-web -o yaml
   ```

3. Verify public and direct application responses. The health response must be minimal and the retired metrics path must be `404`:

   ```bash
   curl -fsS https://lanai.example/api/health
   curl -sS -o /dev/null -w '%{http_code}\n' https://lanai.example/api/metrics
   kubectl --context "$LANAI_STAGING_CONTEXT" -n lanai port-forward deploy/lanai-portal 3001:3001
   curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3001/api/metrics
   ```

4. Verify monitoring isolation. Prometheus must succeed on `9464/metrics`; an unlabelled namespace test Pod must fail to connect. Do not treat a `404` as monitoring success.

   ```bash
   kubectl --context "$LANAI_STAGING_CONTEXT" label namespace <monitoring-namespace> lanai.io/monitoring=true --overwrite
   kubectl --context "$LANAI_STAGING_CONTEXT" -n <monitoring-namespace> exec deploy/prometheus -- \
     wget -qO- http://lanai-portal.lanai.svc.cluster.local:9464/metrics
   ```

5. Verify the AI gateway is not exposed through the API host and only the authenticated portal can reach it. Use an ingress request to `/internal/ai/` and a labelled/unlabelled namespace connectivity probe; retain controller and CNI evidence.

6. Execute `lanai-portal/scripts/dry-run-staging-admission.sh`, then the guarded `run-staging-release-gates.sh` only after all required platform, financial, Dapr, PVC, service-account, RBAC, secret, and immutable-image inputs are present.

7. Exercise a controlled non-production financial outbox dead-letter event. Verify Prometheus records `lanai_financial_outbox_events{status="dead_letter"} > 0`, Alertmanager routes the alert to the approved receiver, and a resolved notification is delivered after recovery.

## Acceptance Criteria

The rollout is acceptable only when all of the following have current evidence: rendered-manifest server-side dry-run, CNI enforcement of port `9464`, no public metrics route, minimal health body, no public AI gateway route, authorized AI path success, Prometheus scrape success, Alertmanager firing/resolved receiver delivery, protected provider callbacks, staging smoke chain success, and financial workflow reconciliation evidence.

The absence of `kubectl`, `kustomize`, CNI observability, APISIX controller access, Alertmanager, or protected secrets is a fail-closed external evidence gap; it must not be represented as a passed staging check.
