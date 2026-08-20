# Enterprise Defence-in-Depth Hardening and Certification

**Author:** Manus AI  
**Repository state:** Repository-controlled security hardening  
**Scope:** External threat, insider threat, denial-of-service resilience, workload admission, and supply-chain integrity.

## Security posture

Lanai uses layered enforcement rather than relying on a single gateway or authorization component. The layers are deliberately independent: Caddy applies edge request limits and browser protections; APISIX performs host routing; the cluster ingress carries OpenAppSec inspection; Keycloak authenticates human and service identities; the portal validates issuer, audience, signing algorithm, verified email, and role; Permify applies relationship authorization and fails closed; PostgreSQL constraints and audit records protect durable operations; and Kubernetes policy protects workload execution.

> No software platform can truthfully be described as "bullet proof." The implemented design reduces attack surface and limits blast radius. Production certification requires live evidence that every infrastructure-enforced layer is deployed, correctly configured, and monitored.

| Threat class | Implemented repository controls | Remaining certification evidence |
|---|---|---|
| External web attack | HSTS, CSP, anti-sniffing, bounded 10 MiB edge bodies, Caddy per-client limits, OpenAppSec prevention-learning policy, raw-body signed webhooks, replay-resistant provider events. | Confirm Caddy plugin build, edge attachment, OpenAppSec policy import, and attack-block telemetry in staging. |
| Credential abuse | Keycloak brute-force controls, short access tokens, PKCE, confidential clients, TOTP required action, OTP lifecycle audit events, verified-email JWT checks. | Enroll privileged users; test TOTP challenge and recovery flows; verify SMTP and event export. |
| Insider misuse | Keycloak role groups, Permify ReBAC/PBAC checks, fail-closed policy errors, admin-only WhatsApp replay, immutable audit records, CRM secret separation, token-rotation RBAC. | Review real admin memberships, service-account roles, audit retention, and break-glass procedure. |
| East-west movement | Tokenless workloads, non-root/read-only/seccomp/capability restrictions, targeted portal/AI network policies, WhatsApp egress limits, Kubernetes restricted PSA labels. | Enforce CNI probes and complete explicit default-deny/allow policies for every shared-service namespace. |
| DDoS/resource exhaustion | Caddy public/admin/inbox/member/auth rate zones, body limits, portal HPA (2–6 replicas), PDB, bounded worker claim leases, metrics/alerts. | Conduct approved staging traffic test and verify WAF/gateway limits, HPA scaling, and alert delivery. |
| Supply-chain compromise | Pinned Docker bases, protected tag release workflow, Trivy, SBOM/provenance attestations, keyless Cosign signatures, fail-closed signed-image renderer, financial gate Cosign verification. | Execute protected tag build, retain attestation/signature artifacts, render real signed manifests, then enforce Gatekeeper deny mode. |

## Gateway and application boundaries

The source configuration intentionally has no APISIX route plugins because the shared controller rejects unsupported plugins atomically. It must not be assumed that APISIX independently enforces JWT or rate limiting. Caddy limits public traffic and preserves trusted forwarding information; the portal validates Keycloak tokens and calls Permify for object-level decisions. OpenAppSec is attached to the shared ingress rather than deployed inside the Lanai namespace.

The edge configuration prevents public `/api/metrics` exposure and overwrites forwarded identity headers with the directly observed remote address. The public API and interactive hosts use separate per-client rate-limit zones. Credential-sensitive administrative and inbox hosts now have their own bounded rate zones.

## Identity, MFA, and privileged action requirements

The realm requires TOTP enrollment using HMAC-SHA256 and records TOTP update/removal events. This applies to interactive user authentication; service accounts use client credentials and must never be placed in interactive MFA flows. Privileged routes require both a local role and a Permify relationship, so a Keycloak group alone does not grant access to admin data or operational replay.

Before production enablement, the identity operator must enroll every administrator and senior advisor, confirm no alternative authentication flow bypasses the required action, restrict service accounts to purpose-specific roles, and verify that emergency recovery follows a logged, approved procedure.

## Release image and Kubernetes admission procedure

All Kubernetes template image fields are now either an immutable `@sha256:` reference or a deliberate `REPLACE_WITH_SIGNED_DIGEST` fail-closed placeholder. Template mode of `audit-kubernetes-images.sh` rejects mutable tags. Release mode also rejects any unresolved placeholder.

A release operator must obtain digest outputs from the protected tag workflow, set `LANAI_PORTAL_IMAGE`, `LANAI_AI_GATEWAY_IMAGE`, and `LANAI_REALM_RENDER_IMAGE`, and run `render-signed-kustomize.sh`. The script verifies each image using Cosign against the trusted release workflow identity before rendering, then rejects any unpinned output image. It renders only; cluster application remains a separately approved operation.

Gatekeeper is supplied in dry-run mode at `config/opa/lanai-workload-security.yaml`. It must first produce zero violations in staging. The cluster security owner may then change it to `deny` and retain the audit and approval evidence. The detailed procedure is in `config/opa/README.md`.

## Residual boundaries

The root deployment scope intentionally does not install a dedicated OpenAppSec, APISIX, OPA, or external secrets operator. These are cluster-platform components and must be present before their policies can be enforced. Public WhatsApp and Chatwoot webhooks remain disabled until the separate activation gates are completed. The legacy mutable-tag `config/k8s/deploy.sh` helper is not a certified release path and must not be used for production.
