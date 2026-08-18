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

Migrations `0008_outbox_claim_leases.sql` and `0009_whatsapp_consumer_leases.sql` add opaque ownership leases and claim-expiry indexes. The dispatcher converts expired or legacy unleased `publishing` rows into durable retries before selecting work; claim-token-guarded final updates prevent a stale dispatcher from overwriting a later attempt. The consumer applies the equivalent lease protocol to `processing` webhook-event rows.

`whatsapp_event_consumer.py` consumes only `whatsapp.message.received` events whose source outbox row is `published`. It claims work using `FOR UPDATE SKIP LOCKED`, invokes the bounded WhatsApp triage AI pillar, validates untrusted model output, and atomically records its projections plus a deterministic `whatsapp.triaged` outbox event. A cooperative claim-renewal thread extends an owned lease every 60 seconds by default during long AI calls; its conditional update requires the original claim token, so it cannot revive a claim recovered by another worker. The webhook still performs no CRM or AI side effects synchronously.

## Test Evidence

The isolated PostgreSQL integration suite validates:

| Test | Expected result |
|---|---|
| Valid signed event | HTTP `200`, one `whatsapp_webhook_events` row, one `outbox_events` row. |
| Exact signed replay | HTTP `200`, `duplicates=1`, still exactly one row in each table. |
| Same event ID / changed payload | HTTP `409`, no second provider-event or outbox row. |
| Invalid signature | HTTP `401`, no database side effect. |
| Subscription token | Correct token returns challenge; incorrect token returns `403`. |
| Published consumer event | Exactly one validated AI inference record and one deterministic `whatsapp.triaged` outbox event are committed. |
| Expired consumer claim | The row is recovered and subsequently processed once. |
| Expired dispatcher claim | Lease recovery clears only expired/legacy publishing claims and leaves valid claims owned. |
| Concurrent consumer claim | Two spawned Python processes race for one published event; exactly one claims it and the row has one attempt. |
| Real row-lock contention | A child process holds `FOR UPDATE`; a second worker’s claim returns no row in under two seconds because `SKIP LOCKED` does not wait. |
| Active consumer renewal | A live renewal thread extends its original lease while preserving one attempt and the same claim token. |

## Zero-Trust Deployment Draft

`config/k8s/whatsapp-bridge.yaml` and `config/k8s/whatsapp-consumer.yaml` are deliberately excluded from root Kustomization until activation. The bridge manifest defines:

- a tokenless service account;
- a two-replica non-root Deployment with read-only root filesystem, `RuntimeDefault` seccomp, all capabilities dropped, bounded resources, and memory-backed `/tmp`;
- an internal `ClusterIP` Service only;
- a dedicated Secret contract containing database URL, Meta verification/app/access credentials, phone ID, and internal service token;
- ingress only from APISIX Pods in a namespace labelled `lanai.io/gateway=true`;
- egress only to the dedicated platform database, kube-dns, and a reviewed egress gateway on TCP `443`.

The consumer manifest defines a separate tokenless, non-root, two-replica worker with no ingress, a dedicated least-privilege database secret contract, and egress only to PostgreSQL, kube-dns, and the in-namespace Ollama runtime on TCP `11434`.

## Staging Activation Criteria

The route must remain disabled until all conditions hold:

1. Build an immutable bridge image from the reviewed Dockerfile, scan it, record provenance/signature, and replace the deliberately invalid image digest.
2. Apply migrations `0007` through `0009` through the approved migration pipeline, with a preflight query for conflicting provider-event table state and any legacy `publishing` outbox rows.
3. Provision `lanai-whatsapp-bridge-secrets` and `lanai-whatsapp-consumer-secrets` from their dedicated templates using separate least-privilege PostgreSQL roles and the protected secret manager.
4. Provision and label the actual APISIX namespace, platform database namespace, and approved egress gateway namespace exactly as required by the NetworkPolicies.
5. Apply the bridge manifest only in isolated staging, validate CNI enforcement with allowed/denied ingress and egress probes, and prove service-account token absence.
6. Run valid and invalid Meta signature tests, GET verification, 128-KiB payload rejection, duplicate replay, conflicting replay, and bridge log-redaction tests.
7. Deploy and verify the idempotent asynchronous `whatsapp.message.received` consumer before sending any live signed event. Demonstrate consumer stale-claim recovery, output-validation failure and retry, exactly-once committed projections for a duplicate delivery, renewal behavior during a deliberately slow inference, and consumer dead-letter alerting.
8. Verify advisor authentication, recipient authorization, audit trail, provider rate limits, and error sanitization for outbound send/draft paths.
9. Reintroduce an APISIX public webhook route only after the above evidence is reviewed and approved. The route must target the internal ClusterIP Service, preserve the raw request body, and not add an authentication transformation that invalidates the provider signature.

No production activation is authorized by the repository changes alone.
