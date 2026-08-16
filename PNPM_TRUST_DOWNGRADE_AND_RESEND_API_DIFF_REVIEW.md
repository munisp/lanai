# pnpm Trust-Downgrade Analysis and Resend API Diff Review

**Assessment date:** 2026-08-16 EDT  
**Repository:** `munisp/lanai`  
**Scope:** `pnpm@10.34.5` supply-chain trust failure and the exact source changes in `resend@6.18.1` relative to `v6.16.0` for OAuth grants and suppression management.

## Executive Decision

The `pnpm@10.34.5` alert is a **real policy failure**, not a release-age issue. The version is sufficiently old for the repository’s seven-day maturity policy, but it was published by the legacy `pnpmuser` publish bot without trusted-publisher or provenance metadata after a sequence of `pnpm` 10.x releases had been published through GitHub Actions OIDC. pnpm’s `no-downgrade` policy is specifically designed to reject this lower-evidence state. [1] [2]

The policy-compliant way to clear the alert is to replace the broad `pnpm` 10.x resolution with a version that has stronger registry evidence. The existing Dependabot PR #40 targets **`pnpm@11.20.0`**, which has GitHub trusted-publisher metadata and a SLSA provenance attestation in the official npm registry. It was published on 2026-08-03 and is older than the repository’s seven-day maturity threshold. The upgrade remains subject to lockfile review, frozen install, complete provider-enabled regression, and the separate Corepack bootstrap remediation described below. [2] [3]

> **Decision:** Do not approve an exception for `pnpm@10.34.5`. Prefer the reviewed PR #40 path to `pnpm@11.20.0`. If a v11 migration is temporarily blocked, pin exactly `pnpm@10.33.4` as a short-lived bridge because it has GitHub trusted-publisher evidence; document a dated migration back to the approved v11 line. Do not use `trustPolicy: off`, `trustLockfile: true`, package-wide exclusions, or `trustPolicyIgnoreAfter` to suppress this event.

## 1. Evidence Behind the Trust-Downgrade Alert

The workspace enforces:

```yaml
minimumReleaseAge: 10080
trustPolicy: no-downgrade
```

This means packages must be at least seven days old and cannot have trust evidence weaker than any earlier-published release. pnpm explains that the comparison is based on **publish date**, not semver order. A later release without trusted-publisher/provenance evidence is rejected if an earlier published release has stronger evidence. [1] [2]

| Version | Published (UTC) | npm publisher evidence | Provenance / attestation | Policy outcome |
|---|---|---|---|---|
| `10.15.1` | 2025-09-01 | `pnpmuser` / `publish-bot@pnpm.io` | None | Historical legacy-publisher release |
| `10.20.0` through `10.33.4` | 2025–2026 | GitHub Actions trusted publisher, OIDC config `oidc:4278a4df-1aad-48ee-a502-ee0d0bdc49bd` | Trusted-publisher evidence | Acceptable evidence level |
| `10.34.5` | 2026-07-10 | `pnpmuser` / `publish-bot@pnpm.io` | No attestation or provenance field | **Rejected: trust downgrade** |
| `11.20.0` | 2026-08-03 | GitHub Actions trusted publisher, OIDC config `oidc:ab8ea4e6-5e14-45ea-9aad-652283679069` | SLSA v1 provenance attestation | Policy-compliant target |

All checked releases have registry tarball integrity values and npm registry signatures. Integrity and signatures show that a fetched tarball matches the registry record; they do not restore the missing publisher trust signal that the policy uses for `10.34.5`.

The exact alert is therefore explained by a publication-process regression: trusted OIDC publishing was used through `10.33.4`, while `10.34.5` reverted to the legacy bot and omitted provenance. This is compatible with a benign release-process exception, but corporate policy must treat it as an unresolved supply-chain risk until an approved replacement or independently controlled artifact is used.

## 2. Policy-Compliant Remediation Path

| Priority | Action | Why it clears the alert | Required gates |
|---:|---|---|---|
| 1 | Consolidate PR #40 to `pnpm@11.20.0` | The version has trusted-publisher and SLSA provenance evidence and meets the seven-day age policy. | Exact lockfile review, frozen install, TypeScript, full provider suite, SBOM/SCA, code-owner review. |
| 2 | If v11 adoption cannot be completed in the current release, pin `pnpm` exactly to `10.33.4` | The last verified v10 trusted-publisher release does not lower trust evidence. | Formal temporary-debt record, exact lockfile, expiry date, same validation gates, planned v11 migration. |
| 3 | Use a corporate artifact repository that ingests the exact, checksum-verified trusted package and preserves provenance | Centralizes controlled provenance and retention. | Security approval, immutable artifact digest, registry-origin review, internal repository policy. |
| 4 | Exact `trustPolicyExclude: ["pnpm@10.34.5"]` | Technically possible but bypasses the signal. | **Not recommended** because a trusted successor is available; only an emergency exception could authorize it. |

The resolution should also correct the `packageManager` field when the organization approves a particular CLI line, so Corepack and the declared development dependency do not diverge. The project currently encounters a **separate local tool-bootstrap error** when Corepack tries to fetch `pnpm@11.20.0`: the installed Corepack key set cannot verify the registry signature key. This is a local bootstrap-tool limitation, not evidence against the `pnpm@11.20.0` registry artifact. Corporate remediation is to use a supported Node/Corepack distribution whose embedded npm signing-key set recognizes the current registry key, or a centrally managed and checksum-verified package-manager bootstrap. Do not disable Corepack signature verification.

### Explicitly Rejected Workarounds

| Workaround | Reason for rejection |
|---|---|
| `trustPolicy: off` | Removes takeover detection for every dependency. |
| `trustLockfile: true` | Treats the lockfile as trusted and suppresses the intended verification pass; inappropriate for automated dependency PRs. [2] |
| Package-wide `trustPolicyExclude: ["pnpm"]` | Permits all present and future pnpm releases without review. |
| `trustPolicyIgnoreAfter` | Would suppress a current, known publisher-evidence regression rather than resolve it. |
| Blind pin to `10.34.5` plus integrity only | Confirms bytes from the registry but does not satisfy the missing publisher-trust evidence. |

## 3. Exact Resend OAuth-Grant API Changes

`v6.18.1` adds a public `resend.oauthGrants` client. The new capability is external to Lanai’s current code: a repository-wide search found no use of `oauthGrants`, `/oauth/grants`, `suppressions`, or `/suppressions` in Lanai TypeScript source. Updating the SDK therefore introduces no currently exercised application behavior, but it adds capability that must be governed if adopted later.

| Method | HTTP request | Data contract | Security review |
|---|---|---|---|
| `resend.oauthGrants.list(options)` | `GET /oauth/grants` with shared pagination query | Returns `object`, `has_more`, and OAuth grants containing `id`, `client_id`, `scopes`, timestamps, revocation state, and client name/logo URI. | **Sensitive metadata:** scopes and connected-client details must not be exposed to member-facing clients. Keep calls server-side and authorize them as an administrative/security operation. |
| `resend.oauthGrants.revoke(id)` | `DELETE /oauth/grants/${id}` | Returns OAuth-grant ID and `revoked_at` / `revoked_reason`. | **High-impact action:** revokes third-party access. Requires strict server-side authorization, audit records, actor attribution, idempotent UX, and confirmation workflow if integrated. |

### Implementation Findings

The client routes both operations through the existing authenticated `Resend` request layer; it introduces no new credential source, background process, file access, process spawning, dynamic evaluation, or direct outbound host beyond the SDK’s configured API base URL.

The `list()` implementation uses the existing pagination-query builder. The `revoke(id)` implementation passes `id` directly into the URL path without `encodeURIComponent()` and lacks an empty-ID early return. In the expected API model the ID is opaque and server-issued, which limits practical exposure, but SDK boundary hygiene should encode and validate all path identifiers. This should be reported upstream before Lanai relies on the method with any caller-controlled identifier.

## 4. Exact Resend Suppression API Changes

`v6.18.1` adds `resend.suppressions` with nested batch operations.

| Method | HTTP request | Input handling | Security / compliance implication |
|---|---|---|---|
| `add({ email })` | `POST /suppressions` | Sends email payload to remote API | Changes delivery eligibility; integrate only through privileged staff workflows with consent/legal-basis and audit evidence. |
| `list({ origin, ...pagination })` | `GET /suppressions` with URL-encoded query | `origin` is constrained by TypeScript to `bounce`, `complaint`, or `manual`; pagination uses common builder | Suppression status is personal-data-adjacent operational information; restrict access and redact in broad analytics. |
| `get(idOrEmail)` | `GET /suppressions/${encodeURIComponent(idOrEmail)}` | Empty input returns a local structured error without a network call; identifier is URL encoded | Correct path-segment encoding protects `+`, `@`, and other email characters. |
| `remove(idOrEmail)` | `DELETE /suppressions/${encodeURIComponent(idOrEmail)}` | Same empty-input and encoding behavior | Can re-enable marketing/transactional email. Require a dual-control or policy-approved removal workflow. |
| `batch.add({ emails })` | `POST /suppressions/batch/add` | Forwards an email array | Client performs no size or email-format validation; the application must enforce limits and validation before calling. |
| `batch.remove({ emails } \| { ids })` | `POST /suppressions/batch/remove` | Type system prohibits both fields at once | Runtime callers can bypass TypeScript. The application must validate exclusivity, size, authorization, and audit each request. |

### Source-Diff Security Findings

The new suppression client is generally better defended than the OAuth revoke client: single-item get/remove calls reject empty identifiers locally and encode identifiers before they become URL segments. List filters are built with `URLSearchParams`, avoiding string concatenation for query inputs. Batch methods, however, merely forward arrays to the provider; they do not enforce maximum batch size, normalize addresses, or validate caller intent.

These APIs are **not current Lanai feature behavior**. If they are adopted, do not expose them directly through a member portal or untrusted tRPC procedure. Add server-only procedures protected by Keycloak/Permify, require an explicit staff role, record audit event and reason, apply batch/rate limits, and preserve consent/suppression history.

## 5. Release Recommendation

1. Resolve the package-manager policy issue first by validating PR #40’s trusted `pnpm@11.20.0` target on a supported Corepack/Node bootstrap, or temporarily pin exactly `10.33.4` under a recorded migration deadline.
2. Regenerate and review the lockfile with no policy bypass for `pnpm`.
3. Repeat the PR #39/#42 candidate installation and provider-enabled suite only after dependency resolution succeeds.
4. Keep the pending Resend `6.18.1` exception subject to its own approval; it is unrelated to the pnpm remedial choice.
5. Treat the OAuth and suppression API additions as future, privileged integration capabilities, not as automatically approved application features.

## References

[1]: https://pnpm.io/supply-chain-security "pnpm: Mitigating supply chain attacks"
[2]: https://pnpm.io/settings/dependency-resolution "pnpm: Dependency Resolution Settings"
[3]: https://docs.npmjs.com/trusted-publishers/ "npm: Trusted publishing and provenance"
[4]: https://github.com/pnpm/pnpm/issues/10622 "pnpm: Unexpected ERR_PNPM_TRUST_DOWNGRADE"
[5]: https://registry.npmjs.org/pnpm "Official npm registry metadata for pnpm"
[6]: https://github.com/resend/resend-node/tree/v6.18.1 "Resend Node SDK v6.18.1 source"
