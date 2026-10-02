# Lanai Pilot: Developer Onboarding Checklist

**Date:** 2 October 2026
**Companion to:** `DEVELOPER_HANDOFF_2026-10-02.md`. Read that first, then use this as the week-one action list.

## Day 1: orientation and health checks

Read before doing anything:

1. `PILOT_SYSTEM_REQUIREMENTS.md` sections 1, 2, and 5 (scope, ID scheme, functional requirements).
2. The top RESUME POINT of `PILOT_PROGRESS_LOG.md` (currently the 30 September entry, Chatwoot live end-to-end).

Then verify the system is up, from the Mac:

```
ssh newwaveclaw@america 'docker exec newwave-dev-control-plane kubectl -n lanai get pods'
```

Expect every pod listed in the handoff doc's topology table to show Running. Then probe the public site:

```
curl -s -o /dev/null -w "%{http_code}" https://lanai.newfire.app/api/health
```

Expect 200. Then probe auth is enforced:

```
curl -s -o /dev/null -w "%{http_code}" https://lanai.newfire.app/api/trpc/clients.list
```

Expect 401. IMPORTANT: probing a non-tRPC path returns the SPA index.html with 200 even when the API is fine, so always probe `/api/trpc/<router>.<method>` when testing the API.

## Day 1: sign-ins to try

- **Advisor:** devadmin via Keycloak at https://lanai.newfire.app
- **Member portal:** eleanor.vance@example.com, PIN 2026. The login UI loop is a known open bug; the data layer is verified working via API. If the browser loop fails, that is the bug, not your account.

## Day 2: deploy drill

Read `deploy_pilot.sh` end to end before running anything. Then deploy the current origin tip:

```
ssh newwaveclaw@america 'bash -s' < /Users/oluwajobamalomo/lanai/deploy_pilot.sh
```

Watch the six phases: sync to origin tip, docker build, runtime layout check, kind load, roll the deployment, run migration, verify tables. On failure the script captures pod logs and restores the previous image with an explicit `kubectl set image`. Never use `kubectl rollout undo` after that: it would roll forward onto the failed revision.

## Day 2: tests

- Disposable Postgres on the Mac: `lanai-test-pg` on port 55432.
- Drop and recreate it before a full-suite run and let the harness migrate. NEVER drizzle-kit push it before a full-suite run; push and the harness migrations collide on CREATE TYPE.
- Targeted suites first (`pnpm vitest run server/triageService.test.ts` style), full suite after.
- Known environmental failures: three suites fail identically at HEAD without a reachable Permify (`PERMIFY_GRPC_ADDRESS` requirements), plus tsc has 6 pre-existing errors (chart.tsx recharts, stripeRouter version pin).
- triageService.test.ts needs the test DB up; otherwise it fails with "DATABASE_URL is required".

## Day 3: the seed and voice scripts

These are the demo-data scripts. Success output looks like this and is worth memorizing:

- `deploy_voice_block.sh`: ends with `whisper health: 200` and the five portal env vars listed as `<set>`.
- `seed_pilot_scenarios.sh`: prints `INSERT 0 1` twice per scenario, then a verify table with exactly 4 rows, conv_996001 through conv_996004.
- If you see "seeded scenario" but 0 rows in the verify table, you have hit the stdin bug: docker exec without -i. See the handoff doc, THE STDIN RULE.

## First-week work order

Same priority order as the handoff doc. Items 1 to 4 are each days of work, not weeks:

1. Member portal login UI loop (blocks the CR-001 browser demo).
2. Briefing stale display after Generate.
3. Twenty CRM "Workspace not found" and the Permify bootstrap gap (full fix plan in the 24 September evening section of PILOT_PROGRESS_LOG.md).
4. Three dead routes: Revenue Analytics, Confirmation Re-brander, Member Portal sidebar link.
5. Bolanle CR decisions: SLA window and urgency tiers. These GATE any SLA or urgency prompt changes. Implement her ruling either way once she gives it.
6. Post-pilot backlog from the ULTRA audit: kanban pipeline, proposal client-link sharing, supply catalogue, Team pages.

## Handing off again

Keep the chain alive for the next person:

1. Update the top RESUME POINT of `PILOT_PROGRESS_LOG.md` with date, what landed, and what is next.
2. Commit and push everything to `pilot/requirements-baseline-2026-09`.
3. Keep the progress log alive: every session that ships something appends a resume point. The log is the project's memory; the handoff docs just point at it.