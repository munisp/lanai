# Dependabot Consolidation Preview

**Repository:** `munisp/lanai`  
**Base revision:** `6e01b51`  
**Assessment date:** 2026-08-15 EDT  
**Scope:** The ten open Dependabot pull requests, the pnpm supply-chain checks that block their combined lockfile, and the resulting provider-enabled regression preflight.

## Executive Decision

The consolidated dependency candidate cannot yet enter the full provider-enabled test suite. It was built in an isolated worktree with the exact manifest changes from all ten open Dependabot pull requests. Resolution was stopped first by the repository’s required `trustPolicy: no-downgrade` for `resend@6.18.1`, then—after a disposable, exact-version Resend exception—by the repository’s seven-day release-age policy for `ip-address@10.5.0`, and then by `update-browserslist-db@1.3.1`. No production configuration was weakened, no production lockfile was modified, no pull request was merged, and no candidate test result is claimed. [1] [2]

> **Result:** The existing `main` remains reproducibly installable with its frozen lockfile and passes TypeScript validation. The earlier complete local provider-enabled run on `main` passed 16 files and 290 tests. The combined PR candidate has **not** been provider-regression-tested because its new dependency graph did not install under the active security policy.

| Check | Existing `main` | Consolidated PR preview |
|---|---|---|
| Frozen install | Passed | Not applicable; manifest and lockfile intentionally differ |
| TypeScript | Passed, 0 errors | Not started; installation gate blocked |
| Full provider-enabled regression | Previously passed: 16 files / 290 tests | Not started; installation gate blocked |
| Supply-chain policy | Preserved | Preserved; correctly blocked resolution |
| Merge status | `main` at `6e01b51` | No PR merged |

## The Resend Trust-Downgrade Alert

The repository deliberately applies a seven-day maturity period (`minimumReleaseAge: 10080`) and a **no-downgrade** trust policy in `pnpm-workspace.yaml`. The latter rejects a package if a later release has weaker publisher-trust evidence than an earlier release. pnpm documents this as a guard against a package takeover; its `trustPolicyExclude` setting supports narrow package/version exceptions, but an exclusion is a security decision and must not be made broad by default. [1] [2]

The exact resolver failure was:

```text
ERR_PNPM_TRUST_DOWNGRADE High-risk trust downgrade for "resend@6.18.1"
Earlier versions had trusted publisher, but this version has no trust evidence.
```

### Observed Resend Evidence

The resolver selected `resend@6.18.1`, which was published on 2026-07-28. The newer `6.19.0` release is younger than the project’s seven-day maturity window. The package’s official npm registry metadata supplies a SHA-512 integrity value and npm signatures. The downloaded tarball SHA-512 exactly matched the registry integrity value:

```text
sha512-XN8XIaDdKF+ziSQ3K23ndUcyhP7U3ze2gky6SPgYkuAOq54mH4Wdhwm7QylEQ3zlz0NzdX7/l1AgmJUZbdPI/Q==
```

Its metadata points to `https://github.com/resend/resend-node.git` at git commit `bbc4a24dc195359b4f80b31b82903476dd65ee45`. The published package declares development and prepublish scripts, but it does **not** declare `preinstall`, `install`, or `postinstall`. This evidence proves the retrieved tarball matches the public registry record; it does **not** restore the publisher-trust evidence that pnpm detected as missing.

| Version | Publish date (UTC) | Resolver relevance | Trust conclusion |
|---|---|---|---|
| `6.16.0` | 2026-06-26 | Direct manifest lower bound | Historical release |
| `6.18.1` | 2026-07-28 | Highest mature candidate selected by resolution | Exact version rejected by no-downgrade |
| `6.19.0` | 2026-08-10 | Newer but not yet seven days old at assessment | Not the selected mature candidate |

## Safe Resolution and Override Hierarchy

The safest option is to **wait** for an Resend release whose publisher-trust evidence satisfies the policy, then rebuild and review the lockfile. It retains both the maturity and trust protections. If immediate release work is unavoidable, use only an approved, time-bounded exception that names the exact version and follows independent integrity, signature, source, diff, and lifecycle-script review.

| Option | Security posture | Recommendation |
|---|---|---|
| Wait for a release with acceptable trust evidence | Preserves all existing controls | **Preferred** |
| Obtain/verify a trusted publisher or provenance release from the maintainer, then rebuild | Preserves policy and creates durable evidence | **Preferred for urgent upgrades** |
| Use an internal, reviewed registry artifact pinned by SHA-512 and provenance | Strong, but requires operating a trusted artifact pipeline | Appropriate for mature platform operations |
| Add `trustPolicyExclude: ["resend@6.18.1"]` after formal approval and review | Limits bypass to exactly one version, but still overrides a takeover signal | Temporary emergency exception only |
| Set `trustPolicy: off`, exclude all `resend` versions, or set broad `trustPolicyIgnoreAfter` | Removes the protective signal for more than the reviewed package/version | **Do not use** |
| Set `trustLockfile: true` merely to avoid the check | Treats the lockfile as pre-trusted; unsuitable for a repository receiving automated PR changes | **Do not use** |

A narrow preview-only exception for `resend@6.18.1` was tested outside `main` after checksum matching. The strict policy remained active for every other package. It successfully moved resolution past the Resend gate, demonstrating that the alert—not a network failure—was the first blocker. That disposable exception is not committed and is not a release recommendation.

## Additional Release-Age Blockers

After the Resend-only preview exception, the resolver correctly stopped on `ip-address@10.5.0`, a transitive dependency selected by `express-rate-limit@8.6.2` and published on 2026-08-10. Its tarball integrity was independently matched to npm metadata, but it had not yet met the seven-day release age. A second disposable, version-specific exception demonstrated that resolution then progressed until `update-browserslist-db@1.3.1`, another 2026-08-10 transitive release selected by the `autoprefixer → browserslist` path.

The sequence proves that a fresh consolidated lockfile would pull several newer transitive versions because the Dependabot pull requests contain only `package.json` changes. Continuing by adding a growing exception list would undermine the intent of the maturity policy. The correct remediation is to wait until all selected transitive versions age past the seven-day window or rebuild against a reviewed, trusted internal registry snapshot. [2]

| Blocker | Dependency path | Exact cause | Safe action |
|---|---|---|---|
| `resend@6.18.1` | Direct dependency | Trust evidence weaker than an earlier version | Wait for trusted evidence or approve exact, temporary exception after review |
| `ip-address@10.5.0` | `express-rate-limit@8.6.2` | Less than seven days old | Wait for maturity; do not use broad age exclusion |
| `update-browserslist-db@1.3.1` | `autoprefixer@10.5.4 → browserslist` | Less than seven days old | Wait for maturity; do not use broad age exclusion |

## Open Dependabot Pull Requests

All ten pull requests are currently **open**, individually **MERGEABLE**, and in GitHub **CLEAN** state. Each changes `lanai-portal/package.json`; none supplies the required reconciled root `pnpm-lock.yaml` update.

| PR | Dependency | Version change | Current GitHub state | Combined conflict detail |
|---:|---|---|---|---|
| [#39](https://github.com/munisp/lanai/pull/39) | `jose` | `6.2.5` → `6.2.8` | MERGEABLE / CLEAN | Shares the adjacent manifest hunk with #42; retain both values when consolidated. |
| [#40](https://github.com/munisp/lanai/pull/40) | `pnpm` (dev) | `10.34.5` → `11.20.0` | MERGEABLE / CLEAN | Isolated manifest line; no semantic source conflict. Requires lockfile/tooling review. |
| [#41](https://github.com/munisp/lanai/pull/41) | `@temporalio/client` | `1.20.3` → `1.22.0` | MERGEABLE / CLEAN | Part of the three-package Temporal hunk; upgrade with #43 and #44 as one compatibility unit. |
| [#42](https://github.com/munisp/lanai/pull/42) | `ioredis` | `5.11.1` → `6.0.0` | MERGEABLE / CLEAN | Shares the adjacent manifest hunk with #39; retain both values when consolidated. Major upgrade requires regression coverage. |
| [#43](https://github.com/munisp/lanai/pull/43) | `@temporalio/workflow` | `1.20.3` → `1.22.0` | MERGEABLE / CLEAN | Part of the three-package Temporal hunk; sequential merging conflicts unless all three values are retained. |
| [#44](https://github.com/munisp/lanai/pull/44) | `@temporalio/worker` | `1.20.3` → `1.22.0` | MERGEABLE / CLEAN | Part of the three-package Temporal hunk; sequential merging conflicts unless all three values are retained. |
| [#45](https://github.com/munisp/lanai/pull/45) | `framer-motion` | `12.43.0` → `13.0.0` | MERGEABLE / CLEAN | Isolated manifest line; major UI-library upgrade must receive frontend regression verification. |
| [#46](https://github.com/munisp/lanai/pull/46) | `react-resizable-panels` | `3.0.6` → `4.12.2` | MERGEABLE / CLEAN | Shares the adjacent manifest hunk with #48; retain both values when consolidated. Major UI-library upgrade. |
| [#47](https://github.com/munisp/lanai/pull/47) | `@types/node` (dev) | `24.13.3` → `26.1.2` | MERGEABLE / CLEAN | Isolated manifest line; TypeScript check is required after lockfile resolution. |
| [#48](https://github.com/munisp/lanai/pull/48) | `recharts` | `2.15.4` → `3.10.1` | MERGEABLE / CLEAN | Shares the adjacent manifest hunk with #46; major charting-library upgrade. |

### Actual Combined Conflict Groups

The individual PRs are clean because each is evaluated against the original base. In the combined candidate, their edits overlap in three contiguous JSON hunks:

| Combined hunk | Pull requests | Correct eventual resolution |
|---|---|---|
| `ioredis` / `jose` | #42 and #39 | `ioredis: 6.0.0`, `jose: 6.2.8` |
| `react-resizable-panels` / `recharts` | #46 and #48 | `react-resizable-panels: ^4.12.2`, `recharts: ^3.10.1` |
| Temporal SDK family | #41, #43, and #44 | Client, worker, and workflow all at `1.22.0` |

## Required Path to a Valid Provider-Enabled Preview

The candidate must not be regression-tested until it installs under the approved dependency policy. Once the release-age and trust issues are formally resolved, use this sequence in a clean worktree:

```bash
pnpm install --frozen-lockfile
pnpm check

DATABASE_URL='postgresql://lanai:lanai_password@localhost:5432/lanai_pr_preview' \
PERMIFY_GRPC_ADDRESS='127.0.0.1:3478' \
PERMIFY_TENANT_ID='lanai-test' \
PERMIFY_INSECURE='true' \
PERMIFY_SCHEMA_FILE='/home/ubuntu/lanai/config/permify/schema.perm' \
RUN_LOCAL_PROVIDER_TESTS=1 \
STRIPE_SECRET_KEY='sk_test_local_provider' \
STRIPE_PRICE_ID_PLATINUM='price_local_provider' \
pnpm vitest run --pool=forks --fileParallelism=false --maxWorkers=1
```

Only after that run is green should the exact manifest and lockfile be committed, each PR rebased or recreated against the consolidated change, and the updates merged. This preserves reproducibility and prevents an untested dependency graph from reaching `main`.

## References

[1]: https://pnpm.io/supply-chain-security "pnpm: Mitigating supply chain attacks"
[2]: https://pnpm.io/settings/dependency-resolution "pnpm: Dependency Resolution Settings"
[3]: https://registry.npmjs.org/resend "Official npm registry metadata for resend"
[4]: https://registry.npmjs.org/ip-address "Official npm registry metadata for ip-address"
