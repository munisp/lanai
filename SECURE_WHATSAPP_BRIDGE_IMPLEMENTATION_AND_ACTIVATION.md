# Secure WhatsApp Bridge Implementation and Activation Gate

## Current Disposition

The repository now contains a secure bridge implementation, durable provider-event persistence, replay/outbox regression tests, and zero-trust deployment drafts. The public APISIX route remains **disabled**. No deployment manifest is included in the root Kustomize resources, and the draft image reference is intentionally non-resolvable.

## Implemented Request Boundary

| Control | Implementation |
|---|---|
| Raw-body integrity | `POST /webhook/whatsapp` reads exact bytes with `request.get_data()` before JSON parsing. |
| Meta signature | Requires `X-Hub-Signature-256` with `sha256=` prefix and 64 hexadecimal digest. |
| HMAC verification | Uses `hmac.new(WHATSAPP_APP_SECRET, raw_body, hashlib.sha256)` and `hmac.compare_digest`. |
| Fail closed | Missing/invalid signature returns `401`; malformed signed payload returns `400`; durable persistence failure returns `503`; event-ID payload conflict returns `409`. |
| GET subscription | Requires configured verification token, `hub.mode=subscribe`, bounded challenge, and constant-time verification-token comparison. |
| Payload bounds | Flask request body is limited to 128 KiB; typed message/event fields are bounded before storage. |
| Privacy | Inbound code logs only outcome counts and fixed error classes; it does not log body, sender, message text, token, provider ID, or draft content. |
| Internal endpoints | Outbound send and AI draft paths require `Authorization: Bearer <WHATSAPP_BRIDGE_INTERNAL_TOKEN>` and bound inputs. |
| Health | `/health` returns only `{"status":"ok"}`. |

## Durable Replay and Outbox Contract

Migration `0007_whatsapp_webhook_events.sql` creates `whatsapp_webhook_events` with a unique `(provider, provider_event_id)` constraint, payload hash, outbox foreign key, processing state, and retry fields. The bridge transaction creates a deterministic WhatsApp outbox row and its provider-event record together; it acknowledges an exact duplicate without another outbox row and fails closed on a reused provider event ID with different payload content.

The bridge only ingests durable work. A future approved worker must consume `whatsapp.message.received` events and perform CRM/AI projection idempotently. The webhook must not execute those side effects synchronously.

## Test Evidence

The isolated PostgreSQL integration suite validates:

| Test | Expected result |
|---|---|
| Valid signed event | HTTP `200`, one `whatsapp_webhook_events` row, one `outbox_events` row. |
| Exact signed replay | HTTP `200`, `duplicates=1`, still exactly one row in each table. |
| Same event ID / changed payload | HTTP `409`, no second provider-event or outbox row. |
| Invalid signature | HTTP `401`, no database side effect. |
| Subscription token | Correct token returns challenge; incorrect token returns `403`. |

## Zero-Trust Deployment Draft

`config/k8s/whatsapp-bridge.yaml` is deliberately excluded from root Kustomization until activation. It defines:

- a tokenless service account;
- a two-replica non-root Deployment with read-only root filesystem, `RuntimeDefault` seccomp, all capabilities dropped, bounded resources, and memory-backed `/tmp`;
- an internal `ClusterIP` Service only;
- a dedicated Secret contract containing database URL, Meta verification/app/access credentials, phone ID, and internal service token;
- ingress only from APISIX Pods in a namespace labelled `lanai.io/gateway=true`;
- egress only to the dedicated platform database, kube-dns, and a reviewed egress gateway on TCP `443`.

## Staging Activation Criteria

The route must remain disabled until all conditions hold:

1. Build an immutable bridge image from the reviewed Dockerfile, scan it, record provenance/signature, and replace the deliberately invalid image digest.
2. Apply migration `0007` through the approved migration pipeline with a preflight query for any conflicting provider-event table state.
3. Provision `lanai-whatsapp-bridge-secrets` from the dedicated secret template using a least-privilege PostgreSQL role and protected secret manager.
4. Provision and label the actual APISIX namespace, platform database namespace, and approved egress gateway namespace exactly as required by the NetworkPolicies.
5. Apply the bridge manifest only in isolated staging, validate CNI enforcement with allowed/denied ingress and egress probes, and prove service-account token absence.
6. Run valid and invalid Meta signature tests, GET verification, 128-KiB payload rejection, duplicate replay, conflicting replay, and bridge log-redaction tests.
7. Start and verify the idempotent asynchronous `whatsapp.message.received` consumer before sending any live signed event.
8. Verify advisor authentication, recipient authorization, audit trail, provider rate limits, and error sanitization for outbound send/draft paths.
9. Reintroduce an APISIX public webhook route only after the above evidence is reviewed and approved. The route must target the internal ClusterIP Service, preserve the raw request body, and not add an authentication transformation that invalidates the provider signature.

No production activation is authorized by the repository changes alone.
