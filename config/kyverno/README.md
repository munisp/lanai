# Kyverno Release Image Verification

`lanai-verify-release-images.yaml` is a cluster-level Kyverno `ClusterPolicy`. It complements the OPA Gatekeeper workload baseline:

| Control | Responsibility |
|---|---|
| OPA Gatekeeper | Requires digest-pinned images and a restricted Pod security posture. |
| Kyverno | Verifies that every matching internal Lanai image has a keyless Cosign signature from the trusted GitHub Actions release workflow. |

The policy applies to Pods created in `lanai` and `lanai-loadtest` whose image reference matches `ghcr.io/munisp/lanai-*`. It has `validationFailureAction: Enforce`, `failurePolicy: Fail`, and requires one keyless signature with all of the following identity constraints:

```text
issuer:  https://token.actions.githubusercontent.com
subject: https://github.com/munisp/lanai/.github/workflows/release-images.yml@refs/tags/v*
rekor:   https://rekor.sigstore.dev
```

`mutateDigest: false` preserves the verified deployment digest. OPA and the signed manifest renderer already reject tag-only references; Kyverno therefore verifies the exact digest selected before deployment.

## Controlled rollout

Install a Kyverno version compatible with this policy before applying it. Ensure the Kyverno admission webhook is itself configured fail-closed for the target production namespaces. Apply the policy only after at least one protected tag release has published the signed digest for every internal image in use.

In staging, retain the following evidence before production enablement:

1. A signed `ghcr.io/munisp/lanai-portal@sha256:...` Pod is admitted.
2. The same digest with its signature removed or an unsigned internal digest is denied.
3. A digest signed by a different GitHub repository or workflow identity is denied.
4. A mutable `ghcr.io/munisp/lanai-portal:tag` reference is denied by OPA and release rendering.
5. Kyverno webhook unavailability fails admission rather than allowing an unverified Pod.

Do not use a generic GitHub issuer-only policy. The repository workflow subject is the trust boundary.
