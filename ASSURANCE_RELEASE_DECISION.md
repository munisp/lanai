# Mission-Critical Code Assurance Release Decision

**Assessment:** `NOT RELEASEABLE` under the supplied strict assurance authority.

**Scope:** The Lanai repository assurance change set created after the prior `645bb98` revision. This decision is deliberately evidence-based: a passing local build or unit suite does not substitute for deployed staging evidence, real financial-provider behavior, or hardened Kubernetes workload controls.

> A release decision of **Not Releaseable** is the correct outcome whenever a Critical release gate is unknown, unverified, or blocked. It is not a claim that all source code is defective; it records that the evidence required for production certification does not yet exist.

## Decision Summary

| Gate | Result | Evidence | Decision |
|---|---|---|---|
| Root workspace dependency install | **Pass** | pnpm 10.26.0 frozen install after lock refresh | Reproducible locally |
| TypeScript | **Pass** | `pnpm --filter lanai-portal check` | 0 compiler errors |
| Production build | **Pass** | `pnpm --filter lanai-portal build` | Portal, server, workflow, worker, migration builds emitted |
| Deterministic tests | **Pass with declared skips** | 272 passed; 11 skipped provider-gated tests | Local code gate passes; not complete provider evidence |
| Local live Permify test | **Pass** | Real local Permify gRPC was used by smoke suites earlier in this assurance cycle | Authorization behavior is locally demonstrated |
| Financial recovery / real TigerBeetle | **Blocked** | No dedicated staging TigerBeetle, Temporal, Fluvio, or Stripe test stack was available | Cannot certify funds flow end to end |
| Deployed gateway / Keycloak / Permify smoke | **Blocked** | No staging kubeconfig or cluster credentials; smoke Job now fails closed instead of skipping auth | Cannot certify deployment topology |
| Production dependency audit | **Pass for known production advisories** | `pnpm audit --prod` previously reported no known production vulnerabilities | Does not prove runtime configuration security |
| SAST | **Manual review required** | Semgrep: 6 `ERROR` prompt-construction false positives reviewed; 1 unresolved medium dependency-graph control | Medium finding blocks strict release |
| Kubernetes configuration scan | **Fail** | Trivy reports 35 high-severity misconfigurations across six manifests | High findings block release |

## Claim and Coverage Control

The material feature inventory is versioned at [`assurance/feature-claims.json`](assurance/feature-claims.json). It separates local structural evidence from live provider evidence. The machine validator at [`assurance/validate-feature-claims.mjs`](assurance/validate-feature-claims.mjs) intentionally fails in strict mode while material staging evidence remains unavailable.

This is the required distinction between **implemented code** and **proven production behavior**.

## Verified Remediations

| Finding | Severity | Repair | Regression / Evidence |
|---|---:|---|---|
| Credentialed wildcard CORS fallback | High | Removed the permissive escape hatch; CORS now requires explicit origins | `server/_core/env.ts`, `server/_core/index.ts` |
| Plaintext Permify transport in production manifests | High | Application and bootstrap jobs now require TLS (`PERMIFY_INSECURE=false`) | `config/k8s/app-tier.yaml`, `config/k8s/jobs.yaml` |
| Inconsistent procedure authorization | High | Admin, senior-advisor, and member procedures require live Permify decisions; tests have an explicit test-only offline bypass only | `server/_core/trpc.ts` |
| Member created without durable authorization ownership | High | New-member tuple is written to Permify; database creation is compensated on failure | `server/db.ts` |
| Unauthenticated or invalid CRM webhook persistence | High | Signature verification now happens before parsing or persistence | `server/_core/twentyWebhook.ts`, provider-contract test |
| Legacy direct ledger route | High | Removed direct posting helper so commission movement must use durable financial workflows | `server/_core/ledger.ts` removed; financial regression coverage retained |
| GraphQL query interpolation | High | CRM task fields are passed as GraphQL variables | `lanai_ai/core/crm_connector.py` |
| Proposal engine syntax defect | High | Repaired invalid nested f-string; all Python modules compile | `lanai_ai/pillars/proposals/proposal_engine.py` |
| CI did not provide its declared live Permify dependency | High | CI now starts the isolated PostgreSQL + Permify compose stack and passes a real gRPC endpoint | `.github/workflows/ci.yml` |
| CI/nightly used stale nested pnpm lock paths | Medium | Both use root pnpm 10.26.0 and the canonical `pnpm-lock.yaml` | CI and nightly workflow configs |
| Nightly Python security scan masked findings | Medium | Removed `|| true`; safety failures now fail the job | `.github/workflows/nightly-security.yml` |
| Placeholder smoke-client secret and auth `SKIP` | High | Smoke Job reads a secret and treats token/protected-call failures as failures | `config/k8s/smoke-test.yaml` |

## Funds-Flow Assessment

The codebase now has durable workflow and idempotency controls, but the strict evidence standard is **not met** without a real staging execution.

| Required property | Code-level status | Certification status |
|---|---|---|
| Deterministic TigerBeetle transfer keys | Implemented in financial activities | Needs real TigerBeetle staging evidence |
| Pending → settlement / void lifecycle | Implemented with durable workflow activities and database mirrors | Needs workflow crash-and-recovery test against real services |
| PostgreSQL mirror uniqueness and transfer ID storage | Implemented and migration-tested locally | Needs reconciliation against real ledger balances |
| Temporal workflow uniqueness | Implemented and unit/chaos-tested locally | Needs staging worker failover evidence |
| Fluvio/outbox delivery evidence | Implemented and audited locally | Needs real topic delivery and replay evidence |
| Stripe webhook idempotency | Implemented with signed webhook verification and workflow start | Needs Stripe test-mode provider evidence |

**Conclusion:** The platform cannot honestly guarantee that every real-world funds-flow scenario is uncompromisable until the dedicated staging financial-workflow runner has completed with live TigerBeetle, Temporal, Fluvio, PostgreSQL, and Stripe test-mode services.

## Release Blockers

### Critical — must close before release

1. **35 high Trivy Kubernetes configuration findings** across `config/k8s/ai-tier.yaml`, `app-tier.yaml`, `data-tier.yaml`, `jobs.yaml`, `platform-tier.yaml`, and `smoke-test.yaml`. The recurring findings are default/root security contexts and writable root filesystems. Remediation must be image-specific and staging-validated: non-root UIDs, dropped Linux capabilities, `allowPrivilegeEscalation: false`, `readOnlyRootFilesystem: true`, and explicit writable `emptyDir`/PVC paths where images require them.
2. **No staging deployment evidence.** Provide a restricted kubeconfig and test-only service secrets, then run the hardened smoke Job and the isolated live financial workflow runner. Failures must be remediated, not converted to skips.
3. **Permify TLS endpoint must exist.** The manifests now fail closed until `permify.permify.svc.cluster.local:3478` presents a trusted TLS certificate. The shared Permify deployment and client trust bundle need staging validation.
4. **Keycloak smoke service account must be provisioned.** Create the `KEYCLOAK_SMOKE_CLIENT_SECRET`; grant its service account the intended restricted Keycloak role and matching Permify relationship needed for `members.list`. The new smoke Job rejects absence or denial.
5. **Flow-of-funds evidence remains incomplete.** Execute the committed live financial-workflow runner and 24-hour dedicated staging soak process; retain signed TigerBeetle, PostgreSQL, Temporal, and Fluvio evidence bundles.

### High / Medium — must close or receive explicit risk acceptance

1. **Dependency graph medium finding:** `@tailwindcss/vite@4.3.3` resolves a `tailwindcss` dependency through an exotic source, preventing `blockExoticSubdeps: true`. The workspace keeps seven-day package maturity and no-downgrade trust policy but records this as an unresolved strict-supply-chain gap. Upgrade or replace the parent package with a registry-only dependency graph, then enable `blockExoticSubdeps`.
2. **Six Semgrep ERROR findings were manually classified as false positives** because they interpolate LLM prompt text but do not execute SQL or reach a database sink. Retain this classification and add targeted Semgrep rule suppression comments only after security review; do not globally ignore the rule.
3. **Eleven provider-gated tests are skipped locally** because they require live Stripe, CRM, and gateway credentials. These are not passing tests and must run in the dedicated staging evidence pipeline.

## Deployment Instructions After Blocker Closure

1. Build and sign immutable images; replace all image tags in the staging manifests with verified digests.
2. Provision non-root-compatible manifests and validate admission against the staging policy controller.
3. Provision mTLS for Permify, Keycloak smoke-client secret/role, and test-only Stripe/CRM credentials.
4. Run:
   - `kubectl apply -f config/k8s/smoke-test.yaml`
   - `kubectl wait --for=condition=complete job/lanai-smoke-test --timeout=300s`
   - `kubectl apply -f config/k8s/loadtest/live-financial-workflow-runner.yaml`
   - `kubectl logs job/lanai-live-financial-workflow-runner`
   - The guarded 24-hour isolated staging soak and its evidence exporter.
5. Re-run Trivy, Semgrep, production dependency audit, and the full CI workflow on the immutable release revision.
6. Reissue this release decision only when all Critical gates show current, reviewable evidence.

## Evidence Locations

| Artifact | Purpose |
|---|---|
| `ASSURANCE_BASELINE.txt` | Revision, inventory, test and deployment baseline |
| `assurance/feature-claims.json` | Claim-and-coverage inventory |
| `assurance/validate-feature-claims.mjs` | Strict claim evidence gate |
| `assurance/validate-assurance-config.py` | CI, smoke, and transport configuration gate |
| `FINANCIAL_ATOMICITY_AUDIT.md` | Financial workflow code audit and staging boundary |
| `LIVE_FINANCIAL_WORKFLOW_OPERATIONS.md` | Controlled real-provider staging runner procedure |
| `PERMIFY_AND_DAILY_RECONCILIATION_REVIEW.md` | Authorization and daily financial reconciliation evidence |
| `assurance/external-sources.md` | External configuration reference used in this review |

## Certification Statement

This codebase is **not certified production-ready** under the supplied assurance authority at this time. The decision is based on documented, reproducible blockers—not speculation. The corrective code and fail-closed gates added in this change set reduce risk and prevent false green signals, but they cannot replace the required staging evidence or Kubernetes hardening work.
