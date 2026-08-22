# Major Dependency Migration Review and Upgrade Plan

**Prepared:** 2026-08-21

**Scope:** Dependabot pull requests #42, #45, #46, and #48.

**Decision:** Do **not** merge these four major-version pull requests unchanged. Each should be superseded by a focused migration branch with the code changes, test evidence, visual checks, and rollback criteria defined below.

> **Repository impact:** The current codebase uses `ioredis` only through the central Redis adapter, Recharts through one shared chart wrapper, and `react-resizable-panels` through one shared resizable-wrapper component. There are no direct production imports of `framer-motion`. This sharply narrows the expected implementation surface, but it does not remove the need for integration and visual evidence.

## 1. Portfolio decision

| PR | Upgrade | Repository touchpoints | Risk | Release decision | Recommended successor branch |
|---|---|---|---|---|---|
| #42 | `ioredis` 5.11.1 → 6.0.0 | `server/_core/infrastructure.ts`; central Redis adapter | **High** — authentication/session and durable outbox dependency | Hold for isolated Redis protocol/staging evidence | `upgrade/ioredis-v6` |
| #48 | `recharts` 2.15.4 → 3.10.1 | `client/src/components/ui/chart.tsx`; dashboard/chart consumers | **Medium** — API/type and visual behavior changes | Hold for TypeScript + visual chart regression approval | `upgrade/recharts-v3` |
| #45 | `framer-motion` 12.43.0 → 13.0.0 | No direct production import found | **Low** — currently likely unused direct dependency, but package/runtime behavior must be verified | Prefer removal audit; otherwise staged upgrade | `audit/framer-motion-usage` or `upgrade/framer-motion-v13` |
| #46 | `react-resizable-panels` 3.0.6 → 4.12.2 | `client/src/components/ui/resizable.tsx` | **High** — renamed components/props and layout persistence changes | Do not merge raw Dependabot PR; implement wrapper migration first | `upgrade/resizable-panels-v4` |

The raw Dependabot PRs change only `package.json`, so they do not encode the migration work required by either the upstream API changes or Lanai’s shared UI wrappers. The safe approach is to close each raw PR as superseded once its dedicated migration branch is opened and validated.

## 2. ioredis 6.0.0 — PR #42

### Compatibility assessment

Lanai creates exactly one lazy Redis client and exposes only `set`, `get`, and `del` through the `Redis` adapter. The adapter uses string keys/values, explicit TTL through `SET ... EX`, `enableReadyCheck: true`, and `maxRetriesPerRequest: 3`. It does not use Redis Cluster, Sentinel, Pub/Sub, custom reply transformers, binary map keys, or `connect` event command dispatch.

ioredis v6 requires Node.js 20 or later; the portal CI uses Node 22, so the runtime prerequisite is met. Version 6 attempts a RESP3 `HELLO 3` handshake by default, while keeping legacy reply mapping by default and falling back to RESP2 for `NOPROTO`/unknown-command errors. The adapter’s simple string operations should retain their current reply shapes, but the handshake is a live operational risk if the staging Redis endpoint is a proxy, managed compatibility layer, or older compatible implementation that handles `HELLO` atypically. [1]

| Required evidence | Exact action | Pass criterion |
|---|---|---|
| Protocol negotiation | Bring up the same Redis/Valkey product, version, TLS mode, and proxy topology used in staging; run a connection probe with ioredis 6 | Client reaches `ready`; no connection retry loop or `HELLO` error |
| Session behavior | Execute advisor session create/read/delete and OAuth state create/read/delete under the upgraded client | All values remain strings; TTL is honored; expired state fails closed |
| Outage behavior | Restart the Redis service during a request and during a background outbox dispatch | Errors are surfaced/retried according to existing application policy; no stale session is accepted |
| Observability | Inspect connection error logs/metrics with a forced bad endpoint then recovery | Errors are visible without credential leakage; recovery becomes ready once |

### Implementation plan

1. Create `upgrade/ioredis-v6` from current `main` and update only `ioredis` plus its lockfile.
2. Keep `replyMapping` at its legacy default. Do **not** opt into RESP3-shaped replies until an explicit application migration exists.
3. Run the existing provider-enabled suite and add an adapter integration test against a local Redis 7/Valkey-compatible service for string reads, EX TTL, reconnect, and session/OAuth state behavior.
4. Run staging with the actual managed Redis endpoint. If its proxy rejects or mishandles `HELLO`, configure the client explicitly for compatibility:

```ts
redisClient = new RedisClient(url, {
  protocol: 2,
  replyMapping: "legacy",
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: true,
  connectTimeout: ENV.redisConnectTimeoutMs,
});
```

5. Only retain `protocol: 2` when staging evidence requires it; otherwise leave the v6 default negotiation in place. This preserves a path to RESP3 while keeping application reply compatibility.
6. Deploy to staging behind a reversible feature flag or canary pod. Observe Keycloak session validation, OAuth callbacks, Redis connection errors, dead-letter growth, and p95 request latency for at least one business-day traffic cycle.

**Rollback:** Revert the dependency/lockfile commit and roll back only the canary deployment. Redis data does not require migration because the adapter stores the same key/value structures.

## 3. Recharts 3.10.1 — PR #48

### Compatibility assessment

Lanai imports Recharts only through `client/src/components/ui/chart.tsx`. That wrapper uses `ResponsiveContainer`, `Tooltip`, `Legend`, and public props/payload types; it does **not** access `CategoricalChartState`, `Customized` internal injected state, `activeIndex`, `Scatter.points`, `Reference.alwaysShow`, or `Reference.isFront`. This avoids the largest functional breaking changes in v3. [2]

However, the shared wrapper types `ChartTooltipContent` against `React.ComponentProps<typeof Tooltip>`, so the TypeScript build is the first compatibility gate. Recharts v3 also changes default accessibility behavior, SVG render order, and some tooltip/axis behavior. Dashboard charts must receive visual review even when compilation passes. [2]

| Required evidence | Exact action | Pass criterion |
|---|---|---|
| Type compatibility | Upgrade package on the dedicated branch; run `pnpm --filter lanai-portal check` | Zero TypeScript errors, especially Tooltip/Legend payload and formatter signatures |
| Unit coverage | Add/execute chart-wrapper tests for custom tooltip/legend payload mapping | Labels, values, colors, icons, and formatter output remain correct |
| Visual regression | Capture desktop and mobile screenshots of every dashboard/chart route in light and dark modes | No clipped labels, legend order regression, tooltip overlap, axis/grid mismatch, or accessibility regression |
| Accessibility | Keyboard-test tooltips/charts with the current expected interaction policy | No unexpected focus trap; `accessibilityLayer` behavior is deliberate |

### Implementation plan

1. Create `upgrade/recharts-v3`, update the dependency and lockfile, then run `pnpm check` before changing application code.
2. If the type checker reports custom-tooltip incompatibilities, migrate old `TooltipProps`-style custom content types to the v3 `TooltipContentProps` model; the existing wrapper’s `React.ComponentProps<typeof Tooltip>` approach may already be compatible. [2]
3. Search for removed APIs before merge:

```bash
rg -n 'CategoricalChartState|activeIndex|alwaysShow|isFront|recharts-scale|react-smooth|Scatter.*points' lanai-portal
```

4. Decide accessibility behavior explicitly. v3 makes the chart accessibility layer enabled by default; retain it unless a documented interaction conflict is demonstrated. [2]
5. Verify render order in charts where tooltip, legend, or reference lines overlap, because v3 relies on JSX/SVG order rather than previous internal ordering behavior. [2]
6. Merge only with visual-review sign-off from product/design and the normal CI/staging evidence.

**Rollback:** Revert the dedicated migration commit. The server and persisted data are unaffected.

## 4. Framer Motion 13.0.0 — PR #45

### Compatibility assessment

A repository-wide production-source search found **no direct imports** of `framer-motion`. This is a materially different situation from the other upgrades: no application migration should be assumed necessary until the package’s role is verified. The safest first step is a dependency-removal audit, not an automatic version bump.

Motion’s React v13 guidance identifies an important change only for Styled Components/Emotion users: `@emotion/is-prop-valid` is no longer an optional dependency automatically used for filtering DOM props. If styled Motion components are present through generated, dynamically loaded, or future code, unfiltered styling props can reach DOM elements unless `MotionConfig.isValidProp`, transient props, or `shouldForwardProp` is configured. [3]

| Required evidence | Exact action | Pass criterion |
|---|---|---|
| Dependency audit | Run `pnpm why framer-motion` and `rg -n 'framer-motion|motion/'` across source, build config, and templates | Identify whether it is direct but unused, dynamically used, or a retained template dependency |
| CSS-in-JS audit | Search for `@emotion`, `styled-components`, `MotionConfig`, and styled motion components | If absent, v13 prop-forwarding risk is not applicable |
| Build/runtime test | Upgrade or remove on a dedicated branch; run TypeScript, production build, and smoke UI routes | No bundle/import/runtime error |
| Optional visual test | If usage is found, exercise animated route, dialog, and gesture paths | No console warnings, prop leakage, focus, gesture, or animation regression |

### Implementation plan

1. Run `pnpm why framer-motion`. If no source, generated-client, or runtime dependency requires it, submit a small removal PR instead of PR #45.
2. If it is required, create `upgrade/framer-motion-v13`, update only this package and lockfile, and run typecheck/build.
3. If Emotion or Styled Components is in use, add the appropriate prop-forwarding strategy before enabling the upgrade:

```tsx
import isPropValid from "@emotion/is-prop-valid";
import { MotionConfig } from "framer-motion";

<MotionConfig isValidProp={isPropValid}>{children}</MotionConfig>
```

4. Preserve the current `framer-motion` package name for the narrow v13 upgrade. A separate architecture decision can later move imports to `motion/react`; do not combine that package rename with a security/dependency upgrade. [3]

**Rollback:** Revert the dependency/lockfile commit or restore the removed package. No database or backend state is involved.

## 5. react-resizable-panels 4.12.2 — PR #46

### Compatibility assessment

Lanai has a single shared wrapper at `client/src/components/ui/resizable.tsx`, but the wrapper directly uses v3-only `PanelGroup`, `PanelResizeHandle`, the `direction` prop type, and v3 data-attribute Tailwind selectors. Version 4 renames `PanelGroup` to `Group`, `PanelResizeHandle` to `Separator`, and `direction` to `orientation`. It also changes panel size semantics (numbers mean pixels; unitless strings mean percentages), persistence wiring, ref APIs, and resize callbacks. [4]

This is a **must-change source migration** before the dependency can be upgraded. The shared wrapper is an advantage: one compatible wrapper patch protects all callers, but all callers must still be smoke-tested for layout, resize, keyboard control, and persistence.

| v3 wrapper/API | v4 replacement | Required Lanai action |
|---|---|---|
| `PanelGroup` | `Group` | Rename primitive and wrapper component mapping |
| `PanelResizeHandle` | `Separator` | Rename primitive and wrapper component mapping |
| `direction="horizontal\|vertical"` | `orientation="horizontal\|vertical"` | Update props/types and all wrapper call sites |
| numeric `defaultSize`, `minSize`, `maxSize` intended as percentages | explicit strings such as `"30%"` | Audit every caller; retain numbers only when pixel values are intentional |
| `autoSaveId` | `useDefaultLayout({ groupId, storage })` | Migrate any persisted layout callers; v4 helper can migrate legacy layouts |
| `onCollapse` / `onExpand` | `onResize(nextSize, id, prevSize)` | Reimplement collapse state transitions if used |
| imperative refs | `useGroupRef`, `usePanelRef`, `groupRef`, `panelRef` | Migrate any imperative caller |
| v3 data-attribute CSS selectors | v4 supported accessibility/element attributes after DOM inspection | Update Tailwind orientation/handle selectors and add DOM assertions |

### Required wrapper patch

The dedicated migration branch should replace the v3 primitive names and prop type usage. The following is the minimum structural change; CSS selectors must then be verified against the rendered v4 DOM rather than assumed from v3 attributes.

```tsx
import * as ResizablePrimitive from "react-resizable-panels";

function ResizablePanelGroup(
  props: React.ComponentProps<typeof ResizablePrimitive.Group>,
) {
  return <ResizablePrimitive.Group data-slot="resizable-panel-group" {...props} />;
}

function ResizableHandle(
  props: React.ComponentProps<typeof ResizablePrimitive.Separator> & { withHandle?: boolean },
) {
  const { withHandle, ...separatorProps } = props;
  return (
    <ResizablePrimitive.Separator data-slot="resizable-handle" {...separatorProps}>
      {withHandle ? <div>{/* current GripVerticalIcon */}</div> : null}
    </ResizablePrimitive.Separator>
  );
}
```

After the rename, prefer the v4 `orientation` prop and test the DOM attributes that the installed version actually emits. Do not retain selectors such as `data-[panel-group-direction=vertical]` without a rendered-DOM assertion; those selectors are tied to the v3 component contract. V4’s `Group` supports `orientation`, `onLayoutChanged`, `groupRef`, and direct `Panel`/`Separator` children, while separators provide WAI-ARIA behavior. [4] [5]

### Implementation plan

1. Create `upgrade/resizable-panels-v4`; update package and lockfile.
2. Apply the wrapper rename patch and use TypeScript errors to enumerate direct consumer changes.
3. Search and convert semantic percentage sizes deliberately:

```bash
rg -n 'defaultSize=\{[0-9]+\}|minSize=\{[0-9]+\}|maxSize=\{[0-9]+\}|PanelGroup|PanelResizeHandle|autoSaveId|onCollapse|onExpand' lanai-portal/client
```

4. Add component tests for horizontal and vertical groups, mouse/pointer resizing, keyboard separator resizing, collapse/expand if enabled, and persisted-layout restoration.
5. Perform visual checks at desktop, tablet, and mobile viewport sizes, including dark mode, nested groups, and any page containing a sidebar/editor/dashboard layout.
6. Verify SSR/build behavior because v4 expands server-rendering support and changes the layout persistence model. [4]

**Rollback:** Revert the dedicated migration commit. Persisted v3 layout formats should not be deleted during the migration; the v4 persistence helper documents legacy layout migration behavior, but the rollback plan must retain the old value until staging acceptance. [4]

## 6. Sequencing and release gates

The four migration branches should not be merged as a batch. The recommended order is:

| Sequence | Branch | Why it is ordered here | Mandatory gate |
|---:|---|---|---|
| 1 | `audit/framer-motion-usage` | Potentially removes an unused dependency with lowest product impact | `pnpm why`, typecheck, build |
| 2 | `upgrade/recharts-v3` | One shared wrapper and strong TypeScript/visual test surface | Typecheck, chart unit tests, visual/accessibility sign-off |
| 3 | `upgrade/resizable-panels-v4` | Source migration required but isolated to shared wrapper | Typecheck, component interaction tests, responsive visual sign-off |
| 4 | `upgrade/ioredis-v6` | High business/identity risk and requires real Redis staging evidence | Local compatibility test, staging protocol/session/outbox evidence, canary window |

Each branch must include a refreshed lockfile, software-bill-of-material/dependency audit, full provider-enabled regression, production build, and proof that the zero-coverage baseline gate still passes. This sequence intentionally separates frontend visual migration risk from Redis session/outbox operational risk.

## References

[1]: https://github.com/redis/ioredis/wiki/Upgrading-from-v5-to-v6 "ioredis: Upgrading from v5 to v6"
[2]: https://github.com/recharts/recharts/wiki/3.0-migration-guide "Recharts: 3.0 migration guide"
[3]: https://motion.dev/docs/react-upgrade-guide "Motion for React: upgrade guide"
[4]: https://github.com/bvaughn/react-resizable-panels/blob/main/CHANGELOG.md "react-resizable-panels: v3 to v4 migration notes"
[5]: https://react-resizable-panels.vercel.app/props/group "react-resizable-panels: Group component properties"
