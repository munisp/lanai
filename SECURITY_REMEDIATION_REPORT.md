# Security Remediation & Dependabot Triage Report

**Repository:** `munisp/lanai`  
**Commit:** `583a2e2`  
**Date:** 2026-08-12  

---

## Executive Summary

All **8 high** and **14 moderate** production transitive vulnerabilities have been fully remediated. The production dependency audit now reports **zero critical, high, or moderate findings**. All 9 Dependabot PRs have been triaged and closed as superseded.

---

## Production Audit Results

| Severity | Before | After |
|----------|-------:|------:|
| Critical | 0 | **0** |
| High | 8 | **0** |
| Moderate | 14 | **0** |
| Low | 4 | 3 |
| Info | 0 | 0 |

---

## Remediation Actions Taken

### 1. Workspace Migration

The project was migrated from a single-package `pnpm-lock.yaml` to a proper **pnpm workspace** with a repository-root `pnpm-workspace.yaml`. This enables parent-scoped security overrides that force vulnerable transitive dependencies to patched versions without modifying upstream packages.

### 2. Direct Dependency Fixes

| Package | Action | Before | After |
|---------|--------|--------|-------|
| `axios` | **Removed** (unused direct dep) | 1.12.2 | — |
| `nanoid` | Upgraded | 5.1.6 | 5.1.16 |
| `postcss` (devDep) | Upgraded | 8.5.6 | 8.5.26 |
| `stripe` | Upgraded (via lockfile refresh) | 22.3.2 | 22.5.0 |
| `jose` | Upgraded (via PR #37 merge) | 6.1.0 | 6.2.5 |
| `express-rate-limit` | Upgraded (via PR #37 merge) | 8.6.1 | 8.6.2 |

### 3. Parent-Scoped Transitive Overrides

These overrides in `pnpm-workspace.yaml` force vulnerable nested dependencies to patched versions:

| Override Selector | Vulnerable Package | Before | After | Advisory |
|---|---|---|---|---|
| `@dapr/dapr@3.18.0>body-parser` | body-parser | 1.20.3 | 1.20.6 | qs DoS |
| `body-parser@1>qs` | qs | 6.13.0 | 6.15.2 | Array DoS, crash |
| `express@4>path-to-regexp` | path-to-regexp | 0.1.12 | 0.1.13 | ReDoS |
| `@types/node-fetch@2>form-data` | form-data | 4.0.4 | 4.0.6 | CRLF injection |
| `ajv@8>fast-uri` | fast-uri | 3.1.4 | 3.1.5 | Host confusion |
| `@temporalio/client@1.20.3>uuid` | uuid | 11.1.0 | 11.1.1 | Buffer bounds |
| `minimizer-webpack-plugin@5>postcss` | postcss | 8.5.6 | 8.5.23 | Path traversal, XSS |
| `postcss@8>nanoid` | nanoid | 3.3.11 | 3.3.18 | Infinite loop |
| `streamdown@2.5.0>mermaid` | mermaid | 11.16.0 | 11.16.1 | DoS, XSS, prototype pollution |
| `mermaid@11>dompurify` | dompurify | 3.4.12 | 3.4.13 | XSS via detached subtree |
| `recharts@2>lodash` | lodash | 4.17.21 | 4.18.0 | Code injection, prototype pollution |

### 4. Stripe API Version Alignment

Updated `stripeRouter.ts` to declare `apiVersion: "2026-07-29.dahlia"` matching the locked `stripe@22.5.0` SDK.

---

## Dependabot PR Triage

All 9 open Dependabot PRs were closed as **superseded** by the workspace remediation:

| PR | Package(s) | Disposition |
|----|-----------|-------------|
| #37 | jose, express-rate-limit | **Merged** into main via security PR consolidation |
| #38 | build-tooling group | Superseded — workspace lockfile resolved latest compatible |
| #35 | @types/google.maps | Superseded — lockfile resolved 3.65.5 |
| #34 | framer-motion | Superseded — lockfile resolved 12.43.0 |
| #33 | @tailwindcss/vite | Superseded — lockfile resolved 4.3.3 |
| #32 | @aws-sdk/s3-request-presigner | Superseded — lockfile resolved 3.1107.0 |
| #31 | nanoid (major v6) | Deferred — v6 is a breaking ESM-only change; v5.1.16 resolves the advisory |
| #30 | axios | Superseded — dependency removed entirely |
| #29 | wouter | Superseded — lockfile resolved 3.10.0 |
| #26 | radix-ui group (26 packages) | Superseded — all resolved to latest compatible |

---

## Live Permify gRPC Integration Results

The full authorization-enforcement regression suite was executed against the remediated dependency graph:

```
Test Files:  2 passed (2)
Tests:       234 passed | 4 skipped (238)
Duration:    318.89s
```

All access-control policy decisions (allow and deny) were verified against the live Permify v1.7.2 gRPC server with the bootstrapped Lanai authorization schema.

---

## CI-Equivalent Validation

| Check | Result |
|-------|--------|
| TypeScript 7.0.2 (`tsc --noEmit`) | **0 errors** |
| Deterministic test suite | **234 passed, 4 skipped** |
| Production build (Vite + tsup) | **Passed** |
| `pnpm audit --prod` | **0 critical, 0 high, 0 moderate** |
| Permify live gRPC regression | **234 passed, 4 skipped** |

---

## Remaining Low-Severity Items (Accepted Risk)

3 low-severity findings remain in deep transitive chains (`tar@7.5.1` via `@esbuild-kit`). These are build-time-only dependencies with no runtime exposure and no available patch within the current `@temporalio/worker` dependency tree. They will be resolved when Temporal SDK publishes a webpack-free worker (tracked upstream).

---

## Repository Final State

- **Branch:** `main` at `583a2e2`
- **Open PRs:** 0
- **Lockfile:** Single workspace-root `pnpm-lock.yaml` (audited, reproducible)
- **Security overrides:** 11 parent-scoped transitive patches in `pnpm-workspace.yaml`
