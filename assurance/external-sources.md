# External Sources Used by the Assurance Review

## pnpm Settings

Source: [pnpm Settings](https://pnpm.io/settings)

The current official pnpm documentation confirms that `minimumReleaseAge`, `minimumReleaseAgeExclude`, `trustPolicy`, and `blockExoticSubdeps` are workspace settings. It also documents that `blockExoticSubdeps` was added in pnpm 10.26.0 and blocks transitive Git and direct-tarball sources; `minimumReleaseAgeExclude` supports narrowly scoped package patterns for documented exceptions.

The Lanai workspace therefore pins pnpm 10.26.0, applies a seven-day release-age policy, uses `trustPolicy: no-downgrade`, and documents the current Tailwind exotic-subdependency incompatibility as a release blocker rather than silently disabling the audit finding.

References:

[1] [pnpm Settings](https://pnpm.io/settings)
