# Financial Evidence and Keyless Release Verification

**Presentation script**  
**Author:** Manus AI  
**Suggested duration:** 10–12 minutes

## Opening: why this control chain exists

Good [morning/afternoon]. This presentation explains two linked assurance controls in the Lanai platform. The first is the **live financial workflow evidence runner**, which proves that an approved staging transaction travels through Temporal, TigerBeetle, PostgreSQL, and the durable event path as designed. The second is the **keyless signed-image release workflow**, which proves that the workload image used for that evidence run is traceable to an approved GitHub release build.

The key principle is simple: a financial result is only credible if we can prove both **what ran** and **what it did**. The release pipeline establishes the first fact. The financial evidence runner establishes the second.

## Part 1: the financial workflow evidence runner

The live runner is not the PostgreSQL mirror soak test. It invokes the deployed Temporal worker and starts the real `bookingCommissionSaga` workflow for each generated staging booking. That distinction matters. The runner is intended to prove the production-shaped financial integration path, not merely database throughput.

Before starting work, the runner requires explicit approval through `LANAI_LOADTEST_APPROVED=true`. It also requires a database URL visibly targeting staging or load test, valid Temporal, TigerBeetle, and Fluvio endpoints, and bounded workload settings. A run above two thousand workflows needs a separate large-run approval. These controls ensure that the runner cannot quietly be pointed at an unapproved environment.

The runner creates a distinct staging member, travel request, approved proposal, and confirmed bookings. Every generated object includes the run ID in its business references. This makes the evidence set traceable and prevents a later audit from confusing test records with ordinary customer data.

For every booking, the runner builds a deterministic workflow ID of the form `financial-commission-<runId>-<bookingId>` and a deterministic idempotency key. It records the intended workflow in PostgreSQL, starts `bookingCommissionSaga` through the Temporal client, and waits for the workflow result. The configured concurrency controls how many real Temporal workflows are active at once.

## Part 2: what the saga must prove

A successful workflow produces a TigerBeetle pending transfer, a TigerBeetle settlement transfer, a posted PostgreSQL ledger mirror, and a durable financial outbox event. The runner does not merely trust a success response. It performs post-run reconciliation.

First, it requires one posted ledger mirror for each requested booking. Second, it checks that the mirror’s pending and settlement transfer IDs equal the IDs returned by the Temporal workflow. Third, it retrieves both transfers from TigerBeetle and verifies the debit account, credit account, pending amount, and settlement-to-pending linkage. Finally, it verifies the deterministic outbox event key `financial:<transferKey>:posted` and requires that every run-owned event has reached `published` state.

At this point, the evidence answers the questions that matter for a financial release: Did the saga execute? Did it create the expected double-entry ledger transitions? Did the PostgreSQL mirror agree with TigerBeetle? And did the business event leave the transactional outbox?

The runner writes an immutable-style evidence summary to the mounted evidence volume. The summary includes the run ID, start and completion time, workflow count, fixture identifiers, mirror count, published-event count, TigerBeetle verification count, Temporal namespace, task queue, and final result.

> A failed assertion stops the runner. It does not attempt to repair financial state automatically. Discrepancies are evidence for investigation and reconciliation, not an opportunity to overwrite the ledger.

## Part 3: outbox and Fluvio boundary

The runner dispatches due outbox events in bounded batches. If a batch reports a delivery failure, the run fails. It also requires every expected run-owned financial event to be marked `published` in PostgreSQL.

It is important to state the boundary precisely. The runner proves successful outbox dispatch and persisted published state. It does not independently consume Fluvio to prove downstream consumer acknowledgement. If a release requires broker-level readback evidence, that should be added as a separate consumer-verification control.

## Part 4: the immutable-image release workflow

Now we turn to the question: how do we know the runner image itself is trusted?

The GitHub Actions workflow is named **Release Signed Images**. It is triggered only when a version tag matching `v*` is pushed, and it runs in the protected `release` environment. The workflow receives `id-token: write`, which enables GitHub Actions to obtain an OpenID Connect identity token for keyless signing.

The workflow builds six deployable images: the portal, AI gateway, Keycloak realm renderer, WhatsApp bridge, financial workflow runner, and ledger soak runner. Each image is built from its specified Dockerfile and context, pushed to GHCR, and identified by the registry-generated content digest.

The workflow does not treat a tag as the release identity. It scans, attests, and signs the immutable `image@sha256:digest` reference. Tags such as the version tag and commit SHA are convenience locators; the digest is the certified deployment identity.

## Part 5: Trivy, provenance, and Cosign

After a build is pushed, Trivy scans the pushed **digest**, not a local image and not a mutable tag. The action is pinned to `aquasecurity/trivy-action@0.28.0` and receives these inputs:

```yaml
image-ref: ${{ matrix.image }}@${{ steps.build.outputs.digest }}
severity: HIGH,CRITICAL
exit-code: "1"
format: table
```

That means every finding at HIGH or CRITICAL severity fails the image’s matrix job. Findings at lower severities are visible in the table output but do not independently fail this workflow. The scan happens before provenance attestation and before signing, so an image that fails the configured vulnerability threshold is not promoted through the normal release sequence.

Next, GitHub publishes a build provenance attestation for the exact digest. Then Cosign is installed and signs the same immutable reference with:

```bash
cosign sign --yes "${IMAGE}@${DIGEST}"
```

No long-lived private signing key is passed to the job. Because the workflow has `id-token: write`, Cosign uses GitHub Actions OIDC for **keyless signing**. The signature is associated with the release workflow’s identity and stored with the registry artifact.

## Part 6: verification before staging

Creating a signature is not enough. The staging release gates and financial soak preflight verify the signature before allowing a signed image to run.

They require a digest-pinned image, then execute `cosign verify` with two trust constraints. First, the certificate issuer must be `https://token.actions.githubusercontent.com`. Second, the certificate identity must match the repository’s protected `release-images.yml` tag-release workflow. This prevents acceptance of an arbitrary signature from an unrelated workflow or identity.

The signed manifest renderer also replaces internal image placeholders only with verified digest references and rejects unresolved placeholders or mutable images in the final rendered manifest.

> The release workflow publishes signed digests. It does not automatically modify deployment manifests. Staging deployment remains a separate, explicitly approved operation that supplies verified digest values to the renderer and release-gate scripts.

## Closing: the assurance story

The combined control chain is: approved source tag, immutable registry digest, vulnerability scan, provenance attestation, keyless OIDC-backed signature, gate-time signature verification, controlled staging deployment, real Temporal workflow execution, TigerBeetle and PostgreSQL reconciliation, and durable outbox publication evidence.

This does not eliminate the need for operational judgement. We still need real staging credentials, a controlled cluster, retained evidence, and formal approval. But it creates a clear, auditable answer to two essential questions: **which artifact ran, and did it preserve the financial invariants we claim to enforce?**

Thank you. I am happy to take questions on the workflow evidence, image trust model, or release-gate requirements.

## Presenter reference table

| Topic | Source file | Key point |
|---|---|---|
| Live runner | `lanai-portal/server/test/live-financial-workflow-runner.ts` | Starts real Temporal workflows and reconciles TigerBeetle, PostgreSQL, and outbox state. |
| Release workflow | `.github/workflows/release-images.yml` | Builds, scans, attests, and keylessly signs immutable image digests. |
| Staging gate | `lanai-portal/scripts/run-staging-release-gates.sh` | Requires Cosign verification before financial evidence Job creation. |
| Soak preflight | `lanai-portal/scripts/preflight-ledger-soak.sh` | Requires a trusted signed digest before high-load PostgreSQL mirror soak execution. |
