# Lanai OPA Gatekeeper Policy Rollout

`lanai-workload-security.yaml` is a **cluster-admission policy**, not an application Pod manifest. It deliberately is not included in root Kustomize because a cluster must install the Gatekeeper CRDs and controller first. Applying a `ConstraintTemplate` to a cluster without those CRDs would make an otherwise valid Lanai deployment fail before policy enforcement exists.

The policy applies to Pods created by all Lanai workload controllers. It audits the following non-negotiable controls: digest-pinned images, `allowPrivilegeEscalation: false`, read-only root filesystems, all Linux capabilities dropped, `runAsNonRoot: true`, `automountServiceAccountToken: false`, and no `hostNetwork`.

## Staging procedure

First install an approved Gatekeeper release at cluster scope through the platform team. Then apply the policy in its committed `dryrun` mode:

```bash
kubectl apply -f config/opa/lanai-workload-security.yaml
kubectl get k8slanaiworkloadsecurity lanai-workloads-baseline -o yaml
```

Resolve every reported violation by rendering the stack through `lanai-portal/scripts/render-signed-kustomize.sh`; do not exempt an application namespace or use tag-based images. The output must have no unresolved image placeholders and must pass `audit-kubernetes-images.sh --release`.

Only after the staging audit has remained violation-free for an approved review period may the platform security owner patch `spec.enforcementAction` from `dryrun` to `deny`. Preserve the Gatekeeper audit output, signed rendered manifest, Cosign verification output, and change approval with the release evidence.

> Gatekeeper checks image **digest pinning** and workload posture. Cosign verification is performed before rendering and at financial release gates. A registry admission verifier may be added as a cluster-level complement, but it must use the same trusted GitHub Actions OIDC issuer and `release-images.yml` workflow identity.
