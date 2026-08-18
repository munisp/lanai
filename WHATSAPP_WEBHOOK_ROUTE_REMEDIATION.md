# WhatsApp Webhook Route Remediation

**Decision:** The public APISIX route to `lanai-whatsapp-bridge:5555` is disabled. It must not be re-enabled until a reviewed bridge deployment demonstrates signed-webhook verification, replay defense, durable idempotency, protected secret injection, and staging evidence.

## Repository Sweep Results

A tracked-file, hidden-path, ignored-file-name, local-development, deployment, and all-history sweep located one bridge implementation:

```text
lanai_ai/pillars/whatsapp/whatsapp_ai_bridge.py
```

The sweep found no Kubernetes Deployment, Service, Secret reference, NetworkPolicy, container image, CI integration test, or APISIX authentication plugin configuration for `lanai-whatsapp-bridge`. `local-dev.sh` can start the Python bridge on port `5555`, but it is not a production deployment contract.

## Verified Bridge Deficiencies

| Control | Source observation | Risk |
|---|---|---|
| POST signature validation | `receive_message()` calls `request.get_json(silent=True)` immediately; it does not read the raw body, inspect `X-Hub-Signature-256`, or compute an HMAC. | Any caller reaching the bridge can create CRM notes, tasks, contacts, and AI work. |
| Constant-time comparison | The module imports `hmac` but has no `hmac.compare_digest` call. | There is no verified signature comparison path. |
| Replay protection | `msg_id` is assigned once and never used again. | Provider retries or replayed payloads can repeat side effects. |
| Durable idempotency | No database write or provider event ledger exists before CRM/AI work. | The process has no atomic duplicate-event boundary. |
| Payload logging | It logs the first 500 bytes of each raw parsed webhook and then sender/message content. | Sensitive client/message data can enter logs. |
| Outbound endpoint protection | `/api/send-whatsapp` accepts caller-provided recipient/message and sends using the provider access token without bridge-local authentication. | A direct bridge exposure could permit unauthorized outbound messages. |
| Health disclosure | `/health` returns service, Ollama state, and model. | Infrastructure information is available if the bridge becomes reachable. |

The GET verification endpoint does check `hub.mode=subscribe` and compares `hub.verify_token` with `WHATSAPP_VERIFY_TOKEN`, but this only supports subscription verification. It does not authenticate inbound POST events.

## Applied Remediation

The following APISIX route was removed from `config/apisix/apisixroute.yaml`:

```yaml
- name: api-host-whatsapp-webhook
  priority: 10
  match:
    hosts:
      - api.lanai.upi.dev
      - api.lanai.newfire.app
    paths:
      - /webhook/whatsapp
  backends:
    - serviceName: lanai-whatsapp-bridge
      servicePort: 5555
```

No public gateway rule now forwards `/webhook/whatsapp` to the unverified bridge. The API-host default backend may still handle the path as an ordinary portal request, but it cannot reach the bridge service.

## Re-enable Criteria

A future bridge implementation must meet every criterion below before an APISIX route is restored.

| Category | Required control |
|---|---|
| POST authenticity | Require `X-Hub-Signature-256`; calculate `sha256=` HMAC over the exact raw request body using a dedicated app-secret; compare with `hmac.compare_digest`; fail closed with `401` before parsing JSON. |
| GET verification | Require a configured verification token; compare in constant time; validate all subscription parameters; return no provider secret. |
| Replay defense | Persist provider message/event ID before side effects under a unique database constraint; acknowledge duplicate events without replaying CRM or AI actions. |
| Payload validation | Enforce bounded raw-body size, expected object/type/schema, and typed message fields before side effects. |
| Privacy | Do not log raw webhook bodies, phone numbers, message text, tokens, provider IDs, or AI drafts. Use redacted correlation IDs only. |
| Outbound authorization | Do not expose the bridge send/draft endpoints publicly. Require portal-issued service authentication plus advisor authorization, recipient validation, rate limits, and audit logging. |
| Secrets | Use a dedicated Kubernetes Secret for verify token, app secret, access token, and phone number ID; no defaults or environment fallback values in manifests. |
| Deployment isolation | Add reviewed Deployment/Service manifests, non-root security context, tokenless service account, NetworkPolicy ingress only from APISIX or the authenticated portal path, and tightly scoped outbound Meta API/DNS egress. |
| Tests | Add raw-body HMAC valid/invalid cases, malformed input, duplicate event, stale replay, outbound authorization, provider error, token-missing, and log-redaction tests. |
| Staging evidence | Demonstrate Meta verification, valid signed test event, invalid-signature rejection, duplicate no-op, protected outbound test, and audited CRM projection in an isolated staging workspace. |

## Validation of the Disablement

Static validation confirms the APISIX route file contains neither `lanai-whatsapp-bridge` nor `/webhook/whatsapp`. The bridge source compiles as Python but its only `msg_id` occurrence is assignment, and no signature-header or `hmac.compare_digest` path exists. This is evidence for disablement, not evidence that the bridge is safe to deploy.
