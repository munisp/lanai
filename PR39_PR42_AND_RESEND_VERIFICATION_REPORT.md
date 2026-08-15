# PR #39 / #42 Validation and Resend Verification Report

**Assessment date:** 2026-08-15 EDT  
**Base revision:** `fabb71b`  
**Scope:** The exact `jose` and `ioredis` updates proposed by Dependabot PRs #39 and #42, plus source-artifact and SBOM verification of `resend@6.18.1` required by the pending emergency-exception draft.  
**Policy status:** No production supply-chain policy was changed. All temporary configuration changes described below existed only in an isolated validation worktree and were removed after assessment.

## Executive Result

The requested **full provider-enabled regression suite was not started** on the PR #39/#42 candidate because a regenerated, reproducible dependency graph could not be produced under the repository’s active supply-chain policy. The test run was not substituted with the already-installed `main` dependency graph, because doing so would not validate `jose@6.2.8` and `ioredis@6.0.0`.

The blocker is fail-closed and correctly enforced. An isolated worktree containing exactly:

```json
"ioredis": "6.0.0",
"jose": "6.2.8"
```

used a review-only, exact `trustPolicyExclude: ["resend@6.18.1"]` selector. It retained `trustPolicy: no-downgrade` for every other package. Resolution then failed for a separate direct development dependency:

```text
ERR_PNPM_TRUST_DOWNGRADE
High-risk trust downgrade for "pnpm@10.34.5" (possible package takeover)
Earlier versions had trusted publisher, but this version has no trust evidence.
```

The PR #39/#42 candidate therefore has no generated lockfile, no dependency installation, and no valid provider-enabled regression result. The evidence does not authorize a bypass of the `pnpm` alert.

| Gate | Result | Interpretation |
|---|---|---|
| Isolated manifest changes | Completed | Candidate contained only PR #39 and PR #42 versions. |
| Resend exact-version review selector | Used in disposable worktree only | Moved past the original Resend alert while preserving no-downgrade checks for other packages. |
| Lockfile regeneration | Blocked | `pnpm@10.34.5` produced a separate trust-downgrade alert. |
| Install from regenerated lockfile | Not started | No valid lockfile exists. |
| TypeScript on upgraded graph | Not started | No upgraded dependency graph installed. |
| Full provider-enabled suite | Not started | Deliberately not run against stale dependencies. |
| Production policy change | None | `main` was not modified. |

## PR #39 and PR #42 Code Scope

PR [#39](https://github.com/munisp/lanai/pull/39) changes only `jose` from `6.2.5` to `6.2.8`. The application uses `createRemoteJWKSet` and `jwtVerify` for Keycloak JWT validation in `server/_core/infrastructure.ts`, and `SignJWT` and `jwtVerify` for signed session cookies in `server/_core/sdk.ts`. The PR itself contains no source-code change.

PR [#42](https://github.com/munisp/lanai/pull/42) changes only `ioredis` from `5.11.1` to `6.0.0`. The application isolates Redis through one wrapper: client construction uses `maxRetriesPerRequest`, `enableReadyCheck`, `lazyConnect`, and `connectTimeout`; the exported wrapper exposes only `set`, `get`, and `del`. Financial workflows do not depend on Redis, as separately enforced by the chaos suite. The version change is still major and needs real Redis and full provider-regression coverage once the graph can be installed.

The two package lines are adjacent, so combining the individually clean Dependabot branches creates one JSON context conflict. The correct conflict resolution preserves both values exactly; it does not change application source.

## Resend Source-Artifact Verification

### Artifact Integrity and Source Identity

The `resend@6.18.1` tarball was downloaded from the official npm registry and its computed SHA-512 exactly matched the registry-published integrity value:

```text
sha512-XN8XIaDdKF+ziSQ3K23ndUcyhP7U3ze2gky6SPgYkuAOq54mH4Wdhwm7QylEQ3zlz0NzdX7/l1AgmJUZbdPI/Q==
```

The package metadata identifies `https://github.com/resend/resend-node.git` and git head `bbc4a24dc195359b4f80b31b82903476dd65ee45`. A clean clone confirmed that this commit is reachable from upstream tag `v6.18.1` (`918595e22f6d1e7407147b0996c037f531a93a26`). There is no semantic diff between the cited git head and the `v6.18.1` tag. The normalized package manifests at the cited source commit and in the published tarball match for package name, version, repository, runtime dependencies, engines, and scripts. [1]

| Verification | Result |
|---|---|
| Registry tarball SHA-512 | Exact match |
| Registry npm signatures | Present in official metadata |
| Published git head | Reachable from upstream `v6.18.1` tag |
| Git-head-to-tag semantic diff | Empty |
| Source / artifact normalized manifest | Match |
| `preinstall`, `install`, `postinstall` | Not declared |

### Source Diff Review

The source diff from `v6.16.0` to the reviewed `6.18.1` git head contains API work for OAuth grants, suppression management, email-receiving forwarding, API-key interface updates, tests, and non-production error logging. The focused review found no newly added `child_process`, `exec`, `spawn`, `eval`, or dynamic-function primitive in the changed `src/` files.

The published artifact static scan found expected reads of `RESEND_BASE_URL`, `RESEND_USER_AGENT`, `RESEND_API_KEY`, and a non-production `console.error` path for API errors. It found no package install hook, process-spawning primitive, shell command, dynamic evaluation primitive, or embedded download command in the distributed JavaScript.

This is **source consistency and static behavior evidence**. It does not cure the publisher-trust downgrade signal or independently prove that the publisher account/release process was uncompromised.

## SBOM and Vulnerability Evidence

A disposable SBOM workspace installed the exact checksum-verified `resend@6.18.1` tarball with `--ignore-scripts`. The resulting CycloneDX SBOM resolved the following package components. The optional `@react-email/render` peer was not installed because the SDK does not require it for the tested core graph.

| Component | Version | Source |
|---|---:|---|
| `resend` | `6.18.1` | Exact reviewed local tarball |
| `postal-mime` | `2.7.5` | npm registry |
| `standardwebhooks` | `1.0.0` | npm registry |
| `@stablelib/base64` | `1.0.1` | npm registry |
| `fast-sha256` | `1.3.0` | npm registry |

Trivy filesystem scanning of this resolved graph, using vulnerability and secret scanners, reported **zero detected vulnerabilities and zero detected secrets** at scan time. That result is scoped to this isolated Resend dependency graph and the local vulnerability database; it is not a substitute for organization-approved SCA, malware analysis, license review, or publisher-account provenance verification.

## Required Next Steps Before Regression and Merge

The correct next action is not to broaden exceptions. Security Engineering must separately investigate and disposition `pnpm@10.34.5` (and any subsequent policy failures), then approve or reject exact temporary selectors only when evidence meets the organization’s threshold. Once lockfile regeneration completes with fully approved controls:

1. Review the complete root `pnpm-lock.yaml` diff, including registry origins and integrity values.
2. Run `pnpm install --frozen-lockfile` on the exact candidate.
3. Run `pnpm check`.
4. Create a fresh local PostgreSQL test database and run the complete provider-enabled suite with real local Permify.
5. Run approved SCA/SBOM, license, secret, and malware scans against the resolved candidate.
6. Run non-production Keycloak JWT, Redis, and email-provider verification before considering a merge.
7. Record all approvals and expiry/removal dates in the security exception ticket.

## Evidence Artifacts

| Artifact | Description |
|---|---|
| `assurance/resend-6.18.1/resend-6.18.1-graph-sbom.cdx.json` | CycloneDX SBOM for the script-disabled, resolved Resend graph. |
| `assurance/resend-6.18.1/resend-6.18.1-graph-trivy.json` | Trivy vulnerability and secret scan result for that graph. |
| `SECURITY_EXCEPTION_REQUEST_RESEND_6_18_1.md` | Draft exception request and mandatory approval controls. |

## References

[1]: https://registry.npmjs.org/resend "Official npm registry metadata for resend"
[2]: https://pnpm.io/supply-chain-security "pnpm: Mitigating supply chain attacks"
[3]: https://pnpm.io/settings/dependency-resolution "pnpm: Dependency Resolution Settings"
[4]: https://github.com/resend/resend-node/tree/v6.18.1 "Resend Node SDK release source"
