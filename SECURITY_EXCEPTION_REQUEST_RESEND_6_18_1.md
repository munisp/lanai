# Security Exception Request: `resend@6.18.1`

**Status:** Draft — **not approved** and not applied to the production dependency policy.  
**Request type:** Temporary software supply-chain policy exception.  
**Request date:** 2026-08-15 EDT.  
**Requested expiration:** 2026-08-29 EDT, or immediately when a policy-compliant Resend release becomes available, whichever occurs first.  
**Requested owner:** Application Engineering Owner — Lanai Portal.  
**Required approvers:** Application Owner, Security Engineering, and Change/Release Owner.

## 1. Decision Requested

Approve a **single, exact-version** temporary exception to pnpm’s `trustPolicy: no-downgrade` control for `resend@6.18.1`, solely to permit a reviewed dependency-lockfile resolution for the Lanai Portal. The exception must be rejected if the lockfile resolves any other Resend version or registry source.

The requested configuration after approval is limited to the following addition. The existing `trustPolicy: no-downgrade` remains enabled for every other dependency and version.

```yaml
trustPolicy: no-downgrade
trustPolicyExclude:
  - "resend@6.18.1" # SEC-EXC-[approved-ticket]; expires 2026-08-29
```

> This request does **not** authorize `trustPolicy: off`, a package-wide `resend` exclusion, `trustPolicyIgnoreAfter`, `trustLockfile: true`, an unreviewed registry change, a broad maturity-policy exception, or a bypass of frozen-lockfile CI.

## 2. Business Justification

The platform has ten open Dependabot updates that require a unified, reproducible `pnpm-lock.yaml` before they can be safely integration-tested and merged. The current strict resolver cannot create that lockfile because it identifies a trust-evidence downgrade for the mature transitive resolution `resend@6.18.1`. The exception would enable an isolated, time-bounded compatibility validation of the consolidated dependency graph without disabling supply-chain controls globally.

**Business impact if denied or deferred:** The dependency consolidation remains blocked until a Resend version with policy-compliant trust evidence is available. Existing `main` remains functional and secure under its frozen lockfile; no production outage is created by deferral.

## 3. Triggering Security Signal

pnpm rejected the selected mature version with:

```text
ERR_PNPM_TRUST_DOWNGRADE: High-risk trust downgrade for "resend@6.18.1"
Earlier versions had trusted publisher, but this version has no trust evidence.
```

The repository intentionally enforces a seven-day release-age requirement and `trustPolicy: no-downgrade`. pnpm states that a no-downgrade policy prevents installation when a later package release has weaker trust evidence than an earlier release; the purpose is to mitigate package takeover risk. [1] [2]

This alert is treated as a **legitimate supply-chain signal**, not as a false positive. The proposed exception is therefore time-bounded, exact-version-scoped, subject to formal approval, and paired with compensating controls.

## 4. Scope and Impact Assessment

| Item | Assessment |
|---|---|
| Affected package | Direct production dependency `resend` |
| Requested version | Exactly `6.18.1`; no semver range or alternate tag |
| Intended registry | `https://registry.npmjs.org/` only |
| Affected environments | Dependency-resolution build step only until all approval gates pass; no production deployment is authorized by this request alone |
| Source-code change | None; this request only permits reviewing a regenerated lockfile |
| Existing primary use | Resend SDK used for email delivery; external communications could be affected if a compromised library were admitted |
| Risk level | High — the exception overrides a package-takeover control for a production dependency |
| Proposed duration | Maximum 14 calendar days; automatic review/expiry on 2026-08-29 EDT |

## 5. Evidence Collected

The following evidence was collected from the official npm registry and locally verified without running package lifecycle scripts.

| Evidence item | Result |
|---|---|
| Package/version | `resend@6.18.1` |
| Publish time | 2026-07-28T12:36:30.367Z |
| Registry tarball | `https://registry.npmjs.org/resend/-/resend-6.18.1.tgz` |
| Registry SHA-512 integrity | `sha512-XN8XIaDdKF+ziSQ3K23ndUcyhP7U3ze2gky6SPgYkuAOq54mH4Wdhwm7QylEQ3zlz0NzdX7/l1AgmJUZbdPI/Q==` |
| Downloaded-tarball SHA-512 | Exact match to the registry integrity value |
| Registry signatures | Two npm registry signatures listed under key ID `SHA256:DhQ8wR5APBvFHLF/+Tc+AYvPOdTpcIDqOhxsBHRwC7U` |
| Declared source repository | `https://github.com/resend/resend-node.git` |
| Published source commit | `bbc4a24dc195359b4f80b31b82903476dd65ee45` |
| Install lifecycle scripts | No `preinstall`, `install`, or `postinstall` script declared |
| Runtime dependencies | `postal-mime@2.7.5`, `standardwebhooks@1.0.0` |
| Publisher-trust status | Insufficient relative to an earlier package release; this is the reason formal approval is required |

The checksum and signature evidence establishes that the reviewed tarball matches the official registry record. It does **not** independently establish that the publisher account or release pipeline was uncompromised; Security Engineering must assess that residual risk.

## 6. Required Compensating Controls

Approval is valid only if all controls below are completed and recorded in the change ticket.

| Control | Required evidence | Responsible role |
|---|---|---|
| Exact selector | Committed selector is exactly `resend@6.18.1`; no wildcard, range, or package-wide exclusion | Application Engineering |
| Registry pinning | Lockfile resolves the package only from the approved npm registry, with the expected SHA-512 integrity | Application Engineering + Security |
| Artifact verification | Independently recompute and match the package SHA-512; retain the output and npm metadata snapshot in the change evidence | Security Engineering |
| Source review | Review the cited source commit and package diff relative to the currently deployed Resend SDK; document findings | Security Engineering |
| Lifecycle review | Confirm no installation lifecycle script is introduced in the resolved artifact or its new transitive graph | Security Engineering |
| SCA and malware scan | Run the approved dependency/SBOM, vulnerability, secret, and malware scans after lockfile generation; resolve or accept findings explicitly | Security Engineering |
| Full functional verification | Run `pnpm check` and the complete local provider-enabled suite against the exact committed lockfile; retain complete results | Application Engineering |
| Email-path verification | Exercise non-production Resend email integration with a test recipient and verify error handling, idempotency, and audit logging | Application Engineering + QA |
| Four-eyes review | Separate reviewers approve both the lockfile diff and policy-exception configuration | Security + Change Owner |
| Monitoring | Alert on mail-delivery error-rate anomaly, package-integrity mismatch, and newly published Resend security advisory | Platform/SRE |

## 7. Explicit Non-Authorization

This exception is invalid if it is used to authorize any of the following:

| Prohibited action | Reason |
|---|---|
| `trustPolicy: off` | Disables takeover protection for all packages. |
| `trustPolicyExclude: ["resend"]` | Excludes all present and future Resend versions. |
| `trustPolicyIgnoreAfter` | Broadens the trust bypass beyond the reviewed package/version. |
| `trustLockfile: true` | Treats a lockfile as trusted and can suppress intended verification. |
| Broad `minimumReleaseAgeExclude` patterns | Allows unrelated immature packages into the dependency graph. |
| Production rollout before the validation gates complete | Converts a dependency-resolution exception into an unreviewed production change. |
| Manual tarball substitution or a different registry | Breaks the reviewed artifact provenance and integrity evidence. |

## 8. Approval and Implementation Workflow

1. The Application Owner creates the change ticket and attaches this request, the registry metadata snapshot, checksum evidence, source-diff review, and business justification.
2. Security Engineering verifies the package account/provenance evidence and either approves, rejects, or requests a safer alternative.
3. The Change/Release Owner sets the expiration to no later than 2026-08-29 EDT and assigns a removal owner.
4. Application Engineering adds only the exact selector, regenerates `pnpm-lock.yaml` in an isolated worktree, and reviews every direct and transitive change.
5. The team runs the full validation gates: frozen install, TypeScript, provider-enabled suite, SCA/SBOM, and non-production email integration verification.
6. The lockfile, test evidence, scan evidence, and approval IDs are reviewed by a second engineer and Security Engineering before any merge.
7. On the first policy-compliant Resend release—or the expiration date, whichever is earlier—the selector is removed, the lockfile is regenerated under the normal policy, and the exception ticket is closed.

## 9. Revocation Triggers

Immediately disable the exception, revoke the pending dependency change, and begin incident triage if any trigger occurs:

- npm or Resend publishes a compromise, account-takeover, malicious-package, or security advisory notice.
- The registry tarball hash, signature information, source repository, source commit, or registry origin differs from the evidence above.
- The regenerated lockfile resolves a version other than `resend@6.18.1`.
- A new install lifecycle script appears in the package or dependency graph.
- SCA, malware, secret, or behavioral analysis reports a high-severity unresolved finding.
- Provider-enabled regression, mail-path integration testing, or production monitoring reports unexplained failures.
- The exception reaches 2026-08-29 EDT without a documented Security Engineering renewal.

## 10. Approval Record

| Approval role | Name | Decision | Date/time | Ticket/reference |
|---|---|---|---|---|
| Application Owner | _Pending_ | _Pending_ | _Pending_ | _Pending_ |
| Security Engineering | _Pending_ | _Pending_ | _Pending_ | _Pending_ |
| Change/Release Owner | _Pending_ | _Pending_ | _Pending_ | _Pending_ |
| Independent Code Reviewer | _Pending_ | _Pending_ | _Pending_ | _Pending_ |

## Appendix A: Dependabot PR #39 and #42 Code Review

### PR #39 — `jose` 6.2.5 to 6.2.8

PR [#39](https://github.com/munisp/lanai/pull/39) is an automated **patch** security update. Its entire code change is a one-line direct production dependency update in `lanai-portal/package.json`:

```diff
- "jose": "6.2.5",
+ "jose": "6.2.8",
```

The application imports `createRemoteJWKSet` and `jwtVerify` in `server/_core/infrastructure.ts` for Keycloak JWKS retrieval and JWT verification. It imports `SignJWT` and `jwtVerify` in `server/_core/sdk.ts` for session-cookie signing and verification. No call-site source change is included or required by this patch-level manifest update. The validation gate must nevertheless run Keycloak gateway coverage and session authentication coverage after the final lockfile is generated.

### PR #42 — `ioredis` 5.11.1 to 6.0.0

PR [#42](https://github.com/munisp/lanai/pull/42) is an automated **major** direct production dependency update. Its entire code change is:

```diff
- "ioredis": "5.11.1",
+ "ioredis": "6.0.0",
```

The application imports the default Redis client in `server/_core/infrastructure.ts`. It constructs the client with `maxRetriesPerRequest`, `enableReadyCheck`, `lazyConnect`, and `connectTimeout`, then exposes only `set`, `get`, and `del` through the platform wrapper. The financial activity and workflow modules intentionally do not depend on Redis; the chaos suite verifies that financial-saga source contains no Redis dependency. The confined wrapper reduces the code-change surface, but the major version still requires a real Redis connection test, cache/timeout behavior check, and the complete provider-enabled regression suite.

### Actual Combined Conflict Resolution

Each PR is individually clean because it modifies the original `main` base. When combined, the adjacent `ioredis` and `jose` JSON lines form one Git conflict hunk. The correct, lossless resolution is to preserve both independently requested values:

```json
"ioredis": "6.0.0",
"jose": "6.2.8",
```

No source-code conflict exists. The merge conflict is only a contiguous `package.json` context conflict. The resolution must be accompanied by a regenerated and reviewed root `pnpm-lock.yaml`; neither individual Dependabot PR currently contains that lockfile change.

## References

[1]: https://pnpm.io/supply-chain-security "pnpm: Mitigating supply chain attacks"
[2]: https://pnpm.io/settings/dependency-resolution "pnpm: Dependency Resolution Settings"
[3]: https://registry.npmjs.org/resend "Official npm registry metadata for resend"
[4]: https://github.com/munisp/lanai/pull/39 "Dependabot PR #39"
[5]: https://github.com/munisp/lanai/pull/42 "Dependabot PR #42"
