# Zero-Coverage Elimination Roadmap and Staging Access Runbook

**Prepared:** 2026-08-21

**Scope:** This document converts the current V8 zero-coverage inventory into an executable testing roadmap and defines the safe, provider-neutral setup required for `kubectl` and Cosign before live staging evidence gates are run.

> **Important boundary:** The 24-module figure is from the final CI-equivalent V8 coverage summary, which includes the PostgreSQL/Permify and local Stripe provider suites but intentionally excludes legacy `smoke.test.ts`, CRM external tests, and the Stripe mock-only suite. The objective is to eliminate **zero-covered production source modules** with meaningful execution tests, not to inflate coverage with import-only tests. [1] [2]

## 1. Inventory and risk classification

The zero-covered modules contain **866 executable lines**, 191 functions, and 726 branches in aggregate. Five modules account for 557 lines, or roughly 64% of the uncovered line inventory: the AI Express routes, generic LLM client, Chatwoot service, Keycloak SDK/session layer, and server bootstrap.

| Priority | Module | Uncovered lines | Primary responsibility | Recommended evidence | Meaningful line target |
|---|---:|---:|---|---|---:|
| P0 | `server/_core/aiRoutes.ts` | 120 | Advisor-only AI HTTP routes, inference-run auditing, gateway request normalization | Express route contract tests with PostgreSQL, real authorization context, and local AI HTTP fixture | 75% |
| P0 | `server/_core/llm.ts` | 114 | Generic LLM requests, streaming/structured responses, model discovery | Local OpenAI-compatible HTTP fixture for success, malformed response, timeout, 429/5xx, and stream parsing | 80% |
| P0 | `server/chatwootService.ts` | 113 | Chatwoot contact/conversation/message synchronization and DB mirror | PostgreSQL + local Chatwoot REST fixture; retry/idempotency/conflict cases | 75% |
| P0 | `server/_core/sdk.ts` | 108 | Keycloak-backed advisor session issuance, cookie parsing, Redis session behavior, role derivation | JWT/JWKS fixture, Redis adapter mock, Permify denial tests, cookie security assertions | 85% |
| P0 | `server/_core/index.ts` | 102 | Portal bootstrap, edge middleware ordering, health/metrics listener, route registration | Spawned child-process smoke test with ephemeral ports and controlled dependency environment | 65% |
| P0 | `server/_core/oauth.ts` | 53 | OAuth start/callback/logout, state transaction, redirect safety | Express HTTP tests with Keycloak SDK/Redis seams and malicious `returnTo` cases | 85% |
| P0 | `server/_core/authMiddleware.ts` | 21 | Raw Express advisor/member route guards | Direct middleware tests for absent, invalid, advisor, and member sessions | 100% |
| P0 | `server/_core/context.ts` | 22 | tRPC context establishment for advisor/member/anonymous calls | Request/cookie cases with SDK and DB seams | 100% |
| P0 | `server/_core/chatwootProxy.ts` | 34 | Authenticated, allow-listed Chatwoot HTTP proxy | Express tests for allowed paths, blocked admin paths, missing session, upstream errors | 95% |
| P0 | `server/_core/storageProxy.ts` | 29 | Authenticated Forge download proxy and path traversal defense | Express tests for advisor/member, invalid keys, traversal, redirects/upstream failure | 95% |
| P1 | `server/_core/heartbeat.ts` | 55 | Scheduled-job API client validation and CRUD | HTTP fixture tests for cron/path/input validation, authorization, and provider failures | 85% |
| P1 | `server/_core/voiceTranscription.ts` | 38 | Speech-to-text upload and language/result normalization | Local STT HTTP fixture for success, unsupported media, invalid response, timeout | 85% |
| P1 | `server/storage.ts` | 37 | Forge storage put/get/signed URL helper | Fixture tests for config absence, key normalization, successful upload/presign, status failure | 90% |
| P1 | `server/_core/imageGeneration.ts` | 31 | Image creation/edit/model listing adapter | Local image-service fixture covering text, edit, malformed and unavailable responses | 90% |
| P1 | `server/_core/dataApi.ts` | 16 | Authenticated data API query/body/path/form encoding | Fixture tests for method/encoding, non-2xx and parse failures | 100% |
| P1 | `server/_core/localAi.ts` | 16 | Lanai AI gateway adapter | Fixture tests for capability routing, JSON/text payloads, auth and gateway errors | 100% |
| P1 | `server/_core/map.ts` | 16 | Google Maps request adapter | Fixture tests for query serialization, array handling, missing config, API errors | 100% |
| P1 | `server/chatwootService.ts` | — | Shared with P0 but has external API behavior | Keep service contract suite separate from proxy authorization suite | 75% |
| P2 | `server/scripts/bootstrapPermify.ts` | 16 | Schema bootstrap CLI | Extract callable `bootstrapPermify()` and test schema I/O/client request; retain a child-process argument/config test | 90% |
| P2 | `server/scripts/migrate.ts` | 13 | Drizzle migration CLI and source/dist path resolution | Export folder resolver/run function; test both source and packaged paths plus migration failure closure | 90% |
| P2 | `server/workflows/activities.ts` | 11 | Temporal-facing outbox persistence and morning briefing activity | Activity tests that assert dispatch failure propagates and successful work is idempotent | 100% |
| P2 | `server/scripts/bootstrapTwentyMetadata.ts` | 10 | Explicitly gated CRM metadata bootstrap CLI | Extract callable bootstrap; test disabled flags, required CRM config, idempotent metadata result | 90% |
| P2 | `server/workflows/worker.ts` | 6 | Temporal worker bootstrap and shutdown lifecycle | Mock Temporal Worker/connection construction; test config and graceful signal shutdown | 90% |
| P2 | `server/workflows/workflows.ts` | 3 | Temporal workflow entrypoints | Temporal test-environment execution asserting activity scheduling/retry options | 100% |
| P3 | `server/_core/vite.ts` | 19 | Development server and production static fallback | Separate development-only route wiring test; exclude from production coverage only if tested in dedicated dev CI | 70% |

The table lists each zero-covered source module exactly once. `chatwootService.ts` appears in the P0 workstream because it is both a large external adapter and a customer-communication data boundary; its repeated row in P1 is a clarification of the test split, not a second module.

## 2. Elimination sequence

The sequence below maximizes risk reduction first and avoids creating false confidence through broad mocks.

| Wave | Modules eliminated from zero coverage | Test harness | Required assertions | Gate to advance |
|---|---|---|---|---|
| A — identity and raw-route security | `sdk`, `oauth`, `context`, `authMiddleware`, `chatwootProxy`, `storageProxy` | Vitest + Express + signed JWT/JWKS/Redis/DB seams | Session fixation prevention, secure cookies, state/nonce expiry, open-redirect denial, allowlist and traversal denial | All security branch tests pass; no raw route accepts an anonymous request |
| B — high-volume business adapters | `aiRoutes`, `llm`, `localAi`, `chatwootService` | PostgreSQL + real Permify + local HTTP provider fixtures | Request shape, authorization, audit/mirror persistence, error mapping, retries, idempotency/replay behavior | Fixtures record contract requests; DB state matches expected outcomes |
| C — remaining external adapters | `heartbeat`, `voiceTranscription`, `storage`, `imageGeneration`, `dataApi`, `map` | Isolated HTTP fixtures, no live provider credentials | Correct serialization, missing-config failure, timeout, non-2xx, schema-invalid body | Each adapter has success and failure behavior tested without a network dependency |
| D — process and workflow entrypoints | `index`, `bootstrapPermify`, `migrate`, `bootstrapTwentyMetadata`, `activities`, `worker`, `workflows`, `vite` | Child-process tests, Temporal test environment, explicit CLI exports | Bounded startup/shutdown, exact config handoff, migration/bootstrap failures fail closed, worker cleanup | No test leaves open handles; entrypoint tests run separately from normal unit tests |

### Design rules for the implementation

First, each adapter must receive a **local protocol fixture**, not a plausible object-returning mock. The Stripe and travel work already demonstrates the pattern: real router code, real PostgreSQL and Permify, with a loopback service that validates headers, paths, form/query encoding, idempotency keys, and controlled error responses. That approach should be reused for LLM, AI gateway, Chatwoot, Forge storage, Maps, data API, transcription, and image generation.

Second, scripts and bootstrap files should expose an importable `run` function while retaining an explicit `if (isMainModule)` launcher. This enables assertion of configuration/exit behavior without importing a file that immediately starts a process. The test remains production-realistic by adding a single bounded child-process execution test per CLI.

Third, server bootstrap and Vite are special cases. Their coverage should come from an ephemeral-port child process or a dedicated test server—not from calling internal helpers alone. If production coverage policy deliberately excludes development-only Vite wiring, move that exclusion into `vitest.config.ts` with a comment and maintain a separate development-server contract suite. Do not leave it silently uncovered.

Finally, define branch-oriented quality gates rather than only line thresholds. At minimum, every adapter needs tests for configuration absence, authenticated success, upstream non-2xx/timeout, malformed response, and sensitive-data non-leakage. Every authorization boundary needs unauthenticated, malformed token/session, unauthorized principal, and authorized principal tests.

## 3. CI structure after implementation

| CI job | Scope | Required infrastructure | Intended outcome |
|---|---|---|---|
| `test` | Full provider-enabled regression | PostgreSQL, Permify, local provider fixtures | Broad functional stability |
| `coverage` | Deterministic V8 suite including local provider contracts | PostgreSQL, Permify, local provider fixtures | Repository coverage and zero-module count trend |
| `adapter-contract` | Local HTTP fixtures for all external adapters | No external credentials | Serialization and error contract evidence |
| `entrypoint` | Spawned portal/CLI/worker lifecycle tests | Ephemeral ports; Temporal test environment where applicable | Bootstrap, shutdown, and configuration behavior |
| `external-sandbox` | Opt-in Stripe/CRM/Chatwoot sandbox checks | Dedicated non-production account/secrets | Live provider compatibility, never required for deterministic coverage |

The coverage job should fail if the zero-covered production-module count rises above the approved baseline and should publish the sorted inventory as a CI artifact. The baseline begins at **24**; a hard threshold of zero should be enabled only after Waves A–D are complete, so that newly added production files cannot silently reset the count.

## 4. Staging access prerequisites

Live staging evidence requires a named change owner, a least-privilege identity granted only the permissions enforced by `run-staging-release-gates.sh`, a provider-issued kubeconfig using short-lived authentication, the cluster CA chain, and an approved immutable runner image. The operator must not use a cluster-admin kubeconfig, a copied production token, `--insecure-skip-tls-verify`, or a mutable image tag. The gate runner itself verifies the current context, namespace labels, granular RBAC permissions, required secrets/resources, a Cosign signature, server-side admission, smoke evidence, and isolated financial evidence. [3]

Before configuration begins, obtain these values from the platform and security owners through the approved secret-delivery channel:

| Item | Required form | Do not use |
|---|---|---|
| Staging API endpoint and CA | Provider-issued kubeconfig or managed-cloud auth profile with CA validation | An admin kubeconfig copied from a control-plane node |
| Identity | Individual SSO/OIDC identity or approved short-lived workload identity | Shared user, static bearer token, or production credential |
| Context name | Immutable, descriptive context such as `lanai-staging-operator` | A default context whose cluster/namespace cannot be identified |
| Namespace names/labels | Exact staging and separate financial-evidence namespaces with required environment labels | Production namespace aliases or the default `lanai-loadtest` namespace without review |
| Registry access | Read-only scoped access to the approved image registry, if private | Docker registry admin token |
| Release image | `ghcr.io/munisp/lanai-financial-workflow-runner@sha256:<digest>` | `:latest`, a branch tag, or any unresolved placeholder |

## 5. Install and verify kubectl on Linux

Select a `kubectl` minor version compatible with the actual staging control plane. Kubernetes documents support for a client within one minor version of the cluster; obtain the exact server minor from the platform owner before choosing `KUBECTL_VERSION`. [4]

```bash
# Example only: replace with the approved client version matching the staging control plane.
export KUBECTL_VERSION='v1.36.0'
export KUBECTL_ARCH='amd64'  # use arm64 on ARM Linux hosts

workdir="$(mktemp -d)"
cd "$workdir"
curl --fail --location --remote-name \
  "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/${KUBECTL_ARCH}/kubectl"
curl --fail --location --remote-name \
  "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/${KUBECTL_ARCH}/kubectl.sha256"
echo "$(cat kubectl.sha256)  kubectl" | sha256sum --check
sudo install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl
kubectl version --client --output=yaml
rm -rf "$workdir"
```

Do not replace checksum verification with `curl | sh`. For managed operator workstations, an enterprise package repository is acceptable only when it pins the same approved minor version and preserves package-signature verification.

## 6. Configure a restricted kubeconfig

A provider-issued kubeconfig should use an `exec` authentication plugin or a cloud SSO credential flow so that credentials expire automatically. Store it with owner-only permissions and do not paste its `users` section into chat, tickets, source control, or shell history.

```bash
# The provider/cluster team supplies this file or the managed-cloud CLI command
# that generates it. It must contain the staging CA data and a short-lived exec/SSO user.
install -d -m 0700 "$HOME/.kube"
install -m 0600 /secure-delivery/lanai-staging.kubeconfig "$HOME/.kube/lanai-staging"

export KUBECONFIG="$HOME/.kube/lanai-staging"
export LANAI_STAGING_CONTEXT='lanai-staging-operator'       # exact approved context name
export LANAI_STAGING_NAMESPACE='lanai-staging'
export LANAI_FINANCIAL_NAMESPACE='lanai-financial-evidence'

kubectl config get-contexts
kubectl config use-context "$LANAI_STAGING_CONTEXT"
kubectl config set-context --current --namespace="$LANAI_STAGING_NAMESPACE"
kubectl cluster-info
kubectl get namespace "$LANAI_STAGING_NAMESPACE" --show-labels
kubectl get namespace "$LANAI_FINANCIAL_NAMESPACE" --show-labels
```

The resulting context must point to the staging API server and should define a short-lived `exec` user rather than embedded static credentials. A provider-neutral shape is shown below; the platform owner must provide the real command and arguments for the chosen cloud or OIDC integration.

```yaml
apiVersion: v1
kind: Config
current-context: lanai-staging-operator
contexts:
  - name: lanai-staging-operator
    context:
      cluster: lanai-staging
      namespace: lanai-staging
      user: lanai-staging-operator
users:
  - name: lanai-staging-operator
    user:
      exec:
        apiVersion: client.authentication.k8s.io/v1
        command: /path/to/provider-or-oidc-auth-plugin
        args: ["get-token", "--cluster", "lanai-staging"]
clusters:
  - name: lanai-staging
    cluster:
      server: https://<approved-staging-api-endpoint>
      certificate-authority-data: <provider-issued-CA-data>
```

Do not construct this YAML manually unless the platform owner has supplied every cluster and authentication value. Managed providers require their own authentication plugin or CLI; use the provider’s documented credential-generation command, then inspect only non-secret fields with `kubectl config get-contexts` and `kubectl cluster-info`.

## 7. Verify least-privilege RBAC before any gate execution

The staging gate will independently perform these checks, but executing them first identifies onboarding gaps without creating workloads. Kubernetes documents `kubectl auth can-i` as the appropriate capability check; use it with the approved context and namespace rather than attempting privileged operations. [5]

```bash
for permission in \
  'create deployment' \
  'create job' 'get job' 'patch job' 'delete job' \
  'create cronjob' 'get cronjob' 'patch cronjob' \
  'get secret' 'get pod' 'get pods/log'; do
  read -r verb resource <<<"$permission"
  kubectl --context "$LANAI_STAGING_CONTEXT" auth can-i "$verb" "$resource" \
    --namespace "$LANAI_STAGING_NAMESPACE"
done

for permission in \
  'create configmap' 'get configmap' 'patch configmap' \
  'create networkpolicy' 'get networkpolicy' 'patch networkpolicy' \
  'create job' 'get job' 'patch job' \
  'get secret' 'get persistentvolumeclaim' 'get serviceaccount' \
  'get components.dapr.io' 'get pod' 'get pods/log'; do
  read -r verb resource <<<"$permission"
  kubectl --context "$LANAI_STAGING_CONTEXT" auth can-i "$verb" "$resource" \
    --namespace "$LANAI_FINANCIAL_NAMESPACE"
done
```

Every required answer must be `yes`. A denied result is a request for a narrowly scoped Role/RoleBinding change; it is not justification to grant cluster-admin or broad `*` permissions.

## 8. Install and verify Cosign

Cosign should be installed from a pinned approved release and verified before it is trusted to verify release images. Sigstore documents a binary installation method and a stronger TUF/artifact-key verification chain for Cosign v3 releases. Cosign v3.0.1 lacks the artifact-key signatures required by that method; choose an approved v3.0.2-or-later release. [6]

```bash
# Set this to the security-approved version; v3.0.2 is the documented minimum
# for artifact-key verification, not an instruction to automatically track latest.
export COSIGN_VERSION='v3.0.2'
export COSIGN_OS='linux-amd64'

# Requires pre-approved Go and jq installations for the bootstrap verifier.
command -v jq >/dev/null || { echo "jq must be installed from the approved OS package source" >&2; exit 1; }
go install github.com/theupdateframework/go-tuf/cmd/tuf-client@latest
export PATH="$(go env GOPATH)/bin:$PATH"

workdir="$(mktemp -d)"
cd "$workdir"
curl --fail --location --output sigstore-root.json \
  'https://raw.githubusercontent.com/sigstore/root-signing/refs/heads/main/metadata/root_history/10.root.json'
tuf-client init https://tuf-repo-cdn.sigstore.dev sigstore-root.json
tuf-client get https://tuf-repo-cdn.sigstore.dev artifact.pub > artifact.pub

curl --fail --location --output cosign-kms.sigstore.json \
  "https://github.com/sigstore/cosign/releases/download/${COSIGN_VERSION}/cosign-${COSIGN_OS}-kms.sigstore.json"
curl --fail --location --output cosign \
  "https://github.com/sigstore/cosign/releases/download/${COSIGN_VERSION}/cosign-${COSIGN_OS}"

# Verify the downloaded binary before installing it.
jq -r '.messageSignature.signature' cosign-kms.sigstore.json | base64 --decode > cosign-kms.sig.decoded
openssl dgst -sha256 -verify artifact.pub \
  -signature cosign-kms.sig.decoded cosign
chmod 0755 cosign
./cosign verify-blob cosign --bundle cosign-kms.sigstore.json --key artifact.pub
sudo install -o root -g root -m 0755 cosign /usr/local/bin/cosign
cosign version
rm -rf "$workdir"
```

If the operator workstation does not have an approved Go bootstrap environment, security should deliver a verified Cosign package through the enterprise software distribution system. Do not bypass release verification with an unchecked downloaded binary, a `curl | bash` installer, or `--insecure-ignore-tlog`.

## 9. Verify the exact Lanai release image

The staging runner uses a GitHub Actions OIDC issuer and a certificate identity regular expression restricted to the Lanai tag-release workflow. Perform the same non-mutating check before a live run, replacing the digest with the release manager’s approved image. [3]

```bash
export LANAI_FINANCIAL_RUNNER_IMAGE='ghcr.io/munisp/lanai-financial-workflow-runner@sha256:<64-hex-digest>'
export LANAI_COSIGN_IDENTITY_REGEX='^https://github\.com/munisp/lanai/\.github/workflows/release-images\.yml@refs/tags/v.+$'
export LANAI_COSIGN_OIDC_ISSUER='https://token.actions.githubusercontent.com'

cosign verify \
  --certificate-identity-regexp "$LANAI_COSIGN_IDENTITY_REGEX" \
  --certificate-oidc-issuer "$LANAI_COSIGN_OIDC_ISSUER" \
  "$LANAI_FINANCIAL_RUNNER_IMAGE"
```

The verification must fail closed for an unsigned image, a signature from another repository/workflow, another issuer, or a mutable reference. Archive the command output with the change record; never archive registry credentials.

## 10. Final preflight and controlled gate execution

Only after the previous steps succeed should the accountable change owner set the explicit approval flag and invoke the repository runner. This command performs server-side admission, authenticated identity smoke, and isolated financial evidence; it is intentionally not safe to run against an unverified context.

```bash
export LANAI_APPROVE_STAGING_EXECUTION='1'
export LANAI_STAGING_ENVIRONMENT='staging'
export LANAI_FINANCIAL_ENVIRONMENT='staging-financial'
export LANAI_FINANCIAL_RUN_ID='CHG-<approved-ticket>-<UTC-timestamp>'

./lanai-portal/scripts/run-staging-release-gates.sh \
  |& tee "staging-release-gates-${LANAI_FINANCIAL_RUN_ID}.log"
```

The change record must retain the context name, namespaces and labels, all `can-i` results, Cosign verification output, server-side admission output, smoke Job logs, financial Job logs, PVC evidence archive, reconciliation report, release image digests, and the exact Git commit. A successful local test run or a successful image build is not a substitute for these artifacts.

## References

[1]: https://github.com/munisp/lanai/blob/2b25a6f6bceaee9033c9bb6dba6aa4a50582be14/lanai-portal/vitest.config.ts "V8 coverage configuration"
[2]: https://github.com/munisp/lanai/blob/2b25a6f6bceaee9033c9bb6dba6aa4a50582be14/lanai-portal/package.json "Coverage command and deterministic provider-test inclusion"
[3]: https://github.com/munisp/lanai/blob/2b25a6f6bceaee9033c9bb6dba6aa4a50582be14/lanai-portal/scripts/run-staging-release-gates.sh "Lanai staging and financial evidence gate"
[4]: https://kubernetes.io/docs/tasks/tools/install-kubectl-linux/ "Kubernetes: Install kubectl on Linux"
[5]: https://kubernetes.io/docs/reference/kubectl/generated/kubectl_auth/kubectl_auth_can-i/ "Kubernetes: kubectl auth can-i"
[6]: https://docs.sigstore.dev/cosign/system_config/installation/ "Sigstore: Cosign installation and verification"
