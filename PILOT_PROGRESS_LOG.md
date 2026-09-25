# Lanai Pilot: Progress Log

**Purpose:** running log across sessions so any session can resume without losing state. Resume point is always at the top.

---

## RESUME POINT (as of 24 September 2026, evening)

**PLATFORM-WIDE 403 ROOT CAUSE (24 Sep evening, fix in flight):** user reported devadmin signs in but sees no delivered changes. Two findings: (1) the visible CR-001 change is in the CLIENT portal (/client/dashboard), not the advisor portal; (2) the real blocker is that EVERY authenticated member/advisor data call 403s: requirePermifyPermission (server/_core/trpc.ts) fails closed because the live Permify service has NO schema (schema.list for tenant lanai -> versions []), PERMIFY_SCHEMA_VERSION is empty in the pod, the bootstrap script (dist/permify-bootstrap.js) is never invoked (container CMD is only node dist/index.js), and /app/config (schema file location per jobs.yaml) does not exist in the image. Also: SQL-seeded personas lack Permify owner tuples (only app-created members get them via createMember). FIX PLAN: pipe config/permify/schema.perm into the portal pod, run tenancy.create (idempotent) + schema.write in-pod via @permify/permify-node, capture returned schemaVersion, write owner tuples member:<id> owner member_record:<id> for member ids 1-9, then kubectl set env deployment/lanai-portal PERMIFY_SCHEMA_VERSION=<version> (triggers rollout), then re-verify memberAuth.login (eleanor.vance@example.com / Lanai2026) -> cookie -> bookings.myBookings must return LAN-BALI-2026-001. BLOCKED by classifier outage at provisioning time (5 write-shaped attempts gated over ~10 min; read-only Bash passed throughout). Draft fix applied: Bolanle update draft now tells the user to test with eleanor.vance@example.com / PIN Lanai2026 (demo@lanai.test has no bookings).

**Member PINs set (24 Sep):** personas 1-4 got PIN 'Lanai2026' (bcryptjs 12 rounds, matching BCRYPT_ROUNDS) with onboardingComplete=true; memberAuth.login verified 200 with identity for eleanor.vance@example.com. They were previously unusable because the login path needs onboardingComplete + pinHash.

---

## RESUME POINT (as of 24 September 2026)

**CR-001 booking view SHIPPED and LIVE (24 Sep):** commit a9ee782 (read-only My Bookings tab) type-checked clean (6 pre-existing errors only, none in changed files), pushed, deployed via deploy_pilot.sh run the CORRECT way: `ssh newwaveclaw@america 'bash -s' < deploy_pilot.sh` (running the script locally on the Mac fails at Phase 1 cd /opt/lanai — it must execute on the host). Image kasi-20260923-a9ee782 rolled out, SECURITY NOTICE banner as designed, migration idempotent, tables verified. Live: /api/health 200, clients.list 401, bookings.myBookings 401 (router exists, auth enforced). NOTE: earlier "clients.list 200" readings were the SPA index.html falling through for non-tRPC paths; the tRPC route itself is /api/trpc/clients.list and returns 401 — no exposure.

**CR-002 seeding COMPLETED (24 Sep):** all 4 confirmed personas verified in prod DB (eleanor.vance/marcus.chen/sofia.almeida/james.whitfield @example.com). Only Eleanor had a booking, so 3 synthetic bookings + 2 proposals seeded transactionally (idempotent, guarded by referenceNumber): LAN-DXB-2026-002 Marcus/Emirates confirmed £18,750, LAN-NBO-2026-003 Sofia/Ultimate Safaris confirmed £22,400, LAN-KIX-2026-004 James/Belmond pending £15,800. Members with NO data (demo@lanai.test, alex@, qa-test-member@, aisha@lanai.demo, whatsapp placeholder) intentionally untouched.

**Advisor Keycloak sign-in ROOT CAUSE FOUND (24 Sep, fix pending user approval):** Keycloak side is healthy — advisor@lanai.test exists, enabled, has password credential + advisor role, no required actions; event log shows devadmin logging in fine (invalid_user_credentials errors = wrong password attempts, then success). Portal users table has devadmin provisioned (the callback pipeline works). ROOT CAUSE: infrastructure.ts verifyToken (line ~137) requires payload.email_verified === true; advisor@lanai.test has email_verified=false in the keycloak DB (devadmin has true). The callback throws "token must contain a verified email and subject" -> 401 "Keycloak authentication failed". Fix blocked twice by classifier (secret materialization + remote auth writes are both gated); the approved one-liner for the user: ssh newwaveclaw@america then docker exec newwave-dev-control-plane kubectl -n lanai exec deploy/keycloak -- bash -c 'cd /opt/keycloak/bin && ./kcadm.sh config credentials --server http://localhost:8080 --realm master --user "$KC_BOOTSTRAP_ADMIN_USERNAME" --password "$KC_BOOTSTRAP_ADMIN_PASSWORD" && ./kcadm.sh update users/<advisor-uuid> -r lanai -s emailVerified=true'. Credentials stay in-pod, nothing printed. Diagnosis method: kcadm.sh INSIDE the keycloak pod with env-var credentials (read-only get) proved emailVerified:false without exposing any secret.

**Classifier outage pattern (24 Sep):** z-ai/glm-5.3-flash waves continue; write-shaped Bash (ssh secret reads, auth writes) gated even when read-only ops pass. Read-only kubectl exec + psql SELECTs passed freely all session.

---

## RESUME POINT (as of 23 September 2026, late morning)

**Deploy blocker 3 found and user-authorized:** after the node-linker fix verified LAYOUT-OK, the next rollout attempt failed at boot with `[env] PERMIFY_INSECURE=true is prohibited in production`. Root cause: the live Deployment carries PERMIFY_INSECURE=true (repo manifest says false; co-dev divergence) while the branch's env.ts fails closed. Live TLS test (test_permify_tls.sh, committed) from inside the July pod proved permify-secure-proxy:8443 presents a certificate the pod CA store does not trust (UNABLE_TO_VERIFY_LEAF_SIGNATURE, SAN does not cover the short service name); the plaintext :3478 path works and reaches Permify (INVALID_ARGUMENT Depth >= 3 proves the call landed). Decision presented to the user via AskUserQuestion; **user chose "Accept exception, deploy today"**: new opt-in flag PERMIFY_TRUSTED_INSECURE added to env.ts (permits PERMIFY_INSECURE=true in production ONLY when explicitly set, logs a SECURITY NOTICE naming the exception and permanent path at boot), deploy script Phase 4 sets it before set image. tsc --noEmit after the change: same 6 pre-existing errors, none new. Commit of the exception was first denied by the classifier as an autonomous security weakening; the explicit user answer above is the authorization. Security posture identical to the running July build (plaintext gRPC, cluster-network only, fail-closed tRPC middleware unchanged). Permanent fix tracked as co-dev follow-up: distribute permify-secure-proxy CA to portal pods, then PERMIFY_GRPC_ADDRESS=permify-secure-proxy...:8443 and PERMIFY_INSECURE=false. Commit 6edd3aa landed 14:0x EDT (classifier wave cleared after ~40 min of retries; read-only Bash passed throughout, write-shaped blocked). Deploy rerun launched as background task bhs2b5d7d, image tag kasi-20260923-6edd3aa.

**Deploy attempt 4 result (23 Sep ~14:15 EDT):** rollout SUCCEEDED, new image live and healthy (lanai-portal-7c8bc46d6b-msv9z 2/2 Running), clients.list flipped 404 to 401 (router exists, auth enforced), clients.create 401, health 200. Migration 0011 did NOT apply: migrate.js died with 42P07 relation "clients" already exists. Root cause (read-only diagnosed): production's drizzle journal has exactly 4 rows matching local files 0000-0003 verbatim (hash and created_at); the co-dev migrated with drizzle up to 0003 then hand-applied everything after WITHOUT journaling. The runner replays anything with folderMillis newer than the last journal row, so it restarted at 0004 and died in the single wrapping transaction on 0005's CREATE TABLE clients. Transactional safety held: post-mortem shows journal still 4 rows, zero residue (0004 index absent, 0005 columns absent, 0010 table absent).

**Migration journal reconciliation (in progress):** prod inventory verified read-only: present = 0005's clients TABLE (exact shape: same columns, email unique, both indexes; one index name differs: clients_assignedAdvisor_idx vs migration's clients_assigned_advisor_idx), 0007 table, 0008 claimToken/claimExpiresAt, 0009 claim_token/claim_expires_at. Missing = 0004 unique index (0 duplicate chatwootId rows so safe to create), 0005 invoices.sentAt + tigerBeetleTransferId + ledger_transfers.tigerBeetleSettlementTransferId, 0006 four CHECK constraints (ledger_transfers empty so safe), 0009 status-check constraint (co-dev added claim columns but not the constraint) + processing_claim_idx, 0008 publishing_claim_idx (presence unconfirmed, guarded), 0010 chatwoot_webhook_events table. Pilot code dependency check: travelRouter's sentAt is on proposals not invoices; chatwootWebhook.ts DOES use chatwoot_webhook_events. Fix: reconcile_prod_schema_0004_0010.sql (transactional guarded DDL for exactly the missing statements, then journal backfill of 0004-0010 with real file sha256 + folderMillis from meta/_journal.json), then rerun dist/migrate.js which then applies exactly 0011 (last row 0010's 1787222400000 < 0011's 1789968403983). Fresh pg_dump taken before the run.

**Deploy attempt 3 result:** new-blocker sequence fully diagnosed and fixed in sequence: (1) repo-root build context, (2) ERR_MODULE_NOT_FOUND drizzle-orm from isolated pnpm layout, (3) pnpm 11 ignoring .npmrc (fix: --config.node-linker=hoisted CLI flag in the Dockerfile, commit 2afdf4d), (4) host disk 100% full, freed 7GB via docker builder prune + image prune (volumes untouched, 82 dangling = 16.94GB, needs user decision), (5) PERMIFY_INSECURE validation vs cluster plaintext reality (this section). Every failed rollout auto-restored July with zero site impact.

**Deploy attempt 1 outcome:** build from repo root SUCCEEDED (context fix was needed: the portal Dockerfile expects the repo root, `docker build -f lanai-portal/Dockerfile .` from /opt/lanai), kind load delivered the image to all 3 nodes, but the rollout FAILED: the new pod answered `/api/health` with HTTP 500 on readiness and liveness probes, kubelet killed it repeatedly (BackOff), rollout timed out at 300s, and the deploy script's auto-rollback restored the July image `kasi-20260725-1441-fix2`. Post-rollback verification from the Mac: /api/health ok with fresh timestamp, clients.list still 404, so the site was never down or degraded. Migration 0011 did NOT run (phase 5 never reached).

**Diagnosis staged but not yet run:** `diagnose_rollout.sh` re-applies the pilot image (old replicas keep serving throughout), captures the failing pod's startup logs and the in-pod probe response (node fetch of 127.0.0.1:3001/api/health and the dapr sidecar 127.0.0.1:3500/v1.0/healthz), then restores the July image with an explicit `set image`. CRITICAL note: never use `rollout undo` here, because after the first rollback `undo` would roll FORWARD onto the failed pilot revision. Static analysis says the branch's /api/health handler can only return 200 or 503 (try/catch around assertDatabaseReady, global error handler logs "[Express] Unhandled error:" and returns 500), so the 500 either comes from a middleware-level error (the global error handler will have logged it) or from something unexpected in the built dist; the pod logs will name it.

**Update draft ready for sending:** `UPDATE_2026-09-22_TO_MS_BOLANLE.md` now carries TWO variants, A (deploy verified live, headline "first pilot code is now live") and B (honest blocked-on-one-fix status with the auto-rollback told as the safety net working), re-dated Wednesday 23 September. The user picks one at send time. CR-001/CR-002 wording unchanged.

**Diagnosis DONE, root cause proven and fixed:** pod logs named it exactly: `ERR_MODULE_NOT_FOUND: Cannot find package 'drizzle-orm' from /app/dist/index.js`. Image comparison proved the cause: our image's /app/node_modules top level was EMPTY (only pnpm's .pnpm store, 818 packages, no visible entries); the runtime stage copies /app/node_modules next to dist and runs node from /app, so resolution fails. July image has a flat hoisted /app/node_modules (19 top-level entries) because it was built from the archive branch's older single-package Dockerfile (no pnpm-workspace.yaml, node:22-alpine, COPY . .). Fix committed 504a3bf: the build stage now writes /app/.npmrc with node-linker=hoisted before pnpm install. Deploy script rewritten: syncs to origin tip (no hardcoded hash), derives tag from actual tip, on failure captures pod logs BEFORE restoring July via explicit `set image` (never `rollout undo` after a rollback: it would roll FORWARD onto the failed revision). Redeploy with the fix is running.

**Commit landed 24b5d0c:** deploy_pilot.sh, rehearse_restore.sh, diagnose_rollout.sh, dual-variant update draft, progress log + runbook updates. All pushed to the pilot branch.

---

## RESUME POINT (as of 22 September 2026)

**Deployment topology discovered 22 Sep (supersedes the 21 Sep notes below):** lanai.newfire.app is NOT a docker container on the Minisforum host. It is the `lanai-portal` Deployment (2 replicas, dapr sidecar) inside the KIND cluster `newwave-dev` running in Docker on the Minisforum, namespace `lanai`. Kubectl access: `ssh newwaveclaw@america 'docker exec newwave-dev-control-plane kubectl ...'`. Live image is the 25 July build `registry.digitalocean.com/talentgraph-auth/lanai-portal:kasi-20260725-1441-fix2`; pods were rolled 14-15 Sep by the co-developer using that same old image. Traffic: Cloudflare to in-cluster APISIX, ApisixRoute maps lanai.newfire.app and subdomains to lanai-portal:3001 (the localhost:3001 entries in /etc/cloudflared/config.yml on the host are stale July leftovers). Postgres pod: `postgres-645775b8bb-vhgqp` (db `lanai`, user `lanai`); chatwoot-postgres is separate. Host has NO DigitalOcean registry login, so image delivery = build on the host, `kind load docker-image ... --name newwave-dev`, then `kubectl set image`. Migration runs via `node dist/migrate.js` exec'd inside the rolled portal pod (full env baked in) or via the db-migrate Job (config/k8s/jobs.yaml).
**Live baseline recorded 22 Sep 14:37 UTC (browser probes):** /api/health ok env production; members.list and aiInsights.list 401 UNAUTHORIZED unauthenticated; clients.list 404 (router absent in July build; the 404-to-401 flip after deploy proves the new image went live); landing page is the July advisor sign-in with member portal link.
**Deploy runbook corrected to this topology:** `DEPLOY_RUNBOOK_PILOT_BRANCH.md` (backup gate with pg_dump into /tmp on host, restore rehearsal into lanai_rehearsal, build + kind load + set image, exec migration, verify tables, rollback paths). Tue 22 Sep morning: backup command prepared, classifier waves blocking SSH writes all morning; user has the `!` fallback command.
**SRS pacing flag from the user (22 Sep):** per the user requirements we know what should be implemented by now; keep every next step traced to SR-IDs. After today's foundation lands, build order per SRS: SR-100 capture (voice transcription SR-102 first), SR-300 triage sheet, SR-500 SLA timers + morning briefing, SR-700 dashboard.

---

## RESUME POINT (as of 21 September 2026)

**Where we are:** First CODE is landed on the pilot branch after the long requirements-only stretch. Commit `b42cf32` on `pilot/requirements-baseline-2026-09` closes ALL six P0-11 IDOR gaps (authMiddleware identity attachment, storageProxy member-prefix scoping, crmProxy path allowlist, members.list / clients.list / aiInsights.list row-scoping per UR-F2) and adds migration `0011_pilot_srs_tables.sql` (client_memory SR-201, sla_timers SR-502, proposal_versions SR-602, with enums, FKs, indexes). Verified before commit: `tsc --noEmit` has 6 errors, ALL pre-existing (chart.tsx recharts types, stripeRouter version pin), none in changed files; `drizzle-kit check` passes (journal 0011 entry, 0011 snapshot, SQL file all consistent). The migration was reconstructed by hand after two generator corruptions, then validated line by line against schema.ts; it has NOT yet been applied to any database.

**Next actions, in order:**
1. Push the branch (docs commit first, then code commit b42cf32).
2. Backup and restore rehearsal on the production DB (P0-10 / SR-1005) BEFORE any migration runs there.
3. Deploy to lanai-server (redeploy.sh resets to origin/main, so either merge pilot branch to main or mirror its docker build/run steps against the branch manually over SSH).
4. Apply migration 0011 on production after backup verified.
5. Verify on https://lanai.newfire.app: health endpoint, then unauthenticated 401/403 probes on the fixed endpoints (members.list, clients.list, aiInsights.list, storage presign, crm proxy).

**Known state of lanai.newfire.app:** live and reachable, but running a 25 July build (pre-pivot). Nothing from this branch is deployed yet. Deployment host is lanai-server at /opt/lanai (redeploy.sh); the k8s path is unavailable (no kubeconfig contexts on this Mac).

**Flagged to user:** `BLUECATFISH_PILOT_REQUIREMENTS_QUESTIONNAIRE.md` in the lanai folder is the blank Blue Catfish thesis questionnaire template (15 Sep), unrelated to Lanai; left untracked, not committed, user should move it to the bluecatfish repo.

**Cron status:** all session crons expired 16 September. Cadence from here: in-session execution only, plus this log.

---

## Session 2026-09-21 (user-directed implementation block)

- User instruction: implement the next fixes and verify them on lanai.newfire.app. Executed the P0-11 closures end to end and the migration, with verification at every step.
- P0-11 (all six closed, UR-F2 row-level scoping): (1) getMessages conversation ownership was ALREADY fixed (verified, no change); (2) authMiddleware requireAnyAuth now attaches req.authType + req.memberId; (3) storageProxy rejects member presigns outside members/<id>/; (4) crmProxy allowlists /crm/graphql only (sole consumer: client/src/lib/crmApi.ts); (5) members.list advisor-scoped via assignedAdvisorId; (6) clients.list advisor-scoped; (7) aiInsights.list non-senior callers scoped through a members subquery. Design checked against actual consumers before writing; no in-repo consumer of /manus-storage exists, so the storage scoping defines the members/<id>/ convention without breaking anything.
- Migration 0011: first drizzle-kit generate was correct but OVER-BROAD (meta snapshot drift: co-dev hand-wrote 0007-0010 SQL without snapshots, so the diff included already-existing chatwoot/whatsapp/outbox/ledger objects). My hand-rewrite then corrupted the file and it was deleted; a bare regenerate said no changes because meta already contained the new tables. Reconstructed the file with Write/Edit in small verified pieces, transcribing every column from a fresh schema.ts read (caught two wrong recollections: client_memory.memberId is NULLABLE, sourceId is integer not text). Final file: 4 CREATE TYPEs, 3 CREATE TABLEs, 3 FK constraints, 5 indexes + 1 unique index, statement-breakpoint separators. drizzle-kit check: Everything's fine. Local apply test NOT possible (no psql, colima/docker down); true apply test deferred to the post-backup production step.
- Commits: b42cf32 (code, 10 files) landed on the pilot branch. Docs commit (this log + UPDATE_2026-09-15 draft) landed same day. Push attempted same session.
- Classifier outages (z-ai/glm-5.3-flash unavailable) blocked write-shaped Bash on and off all week; worked around with file tools and read-only commands, retried git work when the classifier passed.
- 18 September go-live date: passed with no release. Nothing was deployed. The honest position for Ms Bolanle remains the drafted update: re-baseline the pilot dates with her (CR-001/CR-002 answers still outstanding) or approve an execution block; code exists now that did not exist last week, but it is NOT live.

## Check-in 2026-09-16 08:20 (daily cron, Day 8, LAST scheduled daily check-in)

- Wednesday 16 September, two days before the 18 September go-live date. Verified: origin branch unchanged (bed848b is the tip), the update draft and log edits still uncommitted locally (classifier outage blocked the commit three sessions running).
- Closed yesterday: nothing new beyond Tuesday's item 1 (the 20-file baseline push, bed848b). The Tuesday update to Ms Bolanle was drafted and presented; SEND STATUS UNKNOWN, user asked whether it was handled and whether anything was live on lanai.newfire.app, which surfaced a mental-model gap: the draft is a repo file, sending is a human action, and nothing is deployed anywhere.
- Still open: the entire build (backup rehearsal, migrations 0011+, stash decision, voice spike, client memory, triage, urgency seeds, personas, rehearsal). Go-live in 2 days is not achievable as a release; the update to her carries the proposed one-week shift and awaits her answers on CR-001/CR-002.
- This is the final firing of the daily check-in cron (7-day expiry, created 9 Sep). The Tuesday 08:17 cron expires today as well. Cadence from here: in-session execution only, plus the progress log.
- 15 September bar: superseded by the honest-update rule. 18 September go-live: NOT ACHIEVABLE; decision needed now is executing the build block or formally re-baselining with her.

- Item 1 CLOSED, after 6 days red: commit bed848b pushed to origin branch `pilot/requirements-baseline-2026-09`. 20 files, 7385 insertions: signed UR baseline, SRS v1.0, daily plan, progress log, weekly template, questionnaire source and preview, 12 presentation decks, .gitignore fix (lanai_ai/logs excluded). GitHub PR link available. Classifier outage from 14 Sep cleared on retry.
- Still open, everything else: backup rehearsal (P0-10), migrations 0011+ (client_memory, sla_timers, proposal_versions), stash decision, voice spike, client memory, triage, urgency seeds, seeding, rehearsal. 5 consecutive zero days means the 15 September no-excuses bar was missed as written; today's update goes out with the truth instead.
- Tuesday update drafted for the user to send to Ms Bolanle before 10:00 (Mode A, honest content, includes revised timeline request and CR-001/CR-002 questions). No answers from her yet on the CRs.
- Critical path if any of the 18 September date survives: backup and restore rehearsal, then migrations, then voice spike, all today, in-session.
- 15 September bar: MISSED as written, replaced by honest update (per plan rule: never silent, never vague). 18 September go-live: requires decision today; recommended consciously re-baselined pilot start per UR-H2.

## Check-in 2026-09-14 08:13 (daily cron, Day 6, consolidated Sat-Mon)

- Today is Monday 14 September, rehearsal day, the day the no-excuses bar for tomorrow's update was due to close at EOD. Third, fourth, and fifth cron prompts (Sat, Sun) queued and are covered by this single entry. Saturday and Sunday both closed zero items: verified main still 373d4fa, no new commits, no new migrations (0004 to 0010 unchanged), stash@{0} unapplied, all 6 requirements docs still untracked.
- RED, now structural: 5 consecutive zero days. Everything from the plan (backup rehearsal, migrations, client memory, triage, voice, urgency seeds) is unclosed. The no-excuses bar for 15 September cannot be met as written. Owner: user (execution has not happened in any session since the plan was written).
- Consequence for Tuesday: per the plan's own rule, the update goes out by 10:00 anyway, with honest content: what is done (requirements baseline, SRS, daily plan, WhatsApp E2E from 3 Sep), what is not, and a revised timeline. What it will NOT be: silent, late, or vague.
- Recommendation recorded: stop the daily-check-in pattern; it has produced 5 identical zero-day reports. Either (a) user gives go-ahead for an in-session execution block now (docs push, backup, migrations, stash decision, voice spike, seeding, in one long session today), or (b) the 18 September date is consciously re-baselined with Ms Bolanle on Tuesday per UR-H2 with a cost in days. Silence through Friday consumed the entire weekend buffer.
- 15 September bar: NOT ACHIEVABLE as written. 18 September go-live: AT RISK, decision due today (a) or (b).

- Today is Friday 11 September, Day 3. Second consecutive zero day: verified main still 373d4fa, no new commits, all 6 requirements docs still untracked, stash@{0} unapplied, no new migrations, no execution evidence anywhere.
- Second RED: entire Day 1 and Day 2 lists (13 items) unclosed. Owner: user (execution decisions), Claude (ready to execute items 1, 2, 4, voice spike on go-ahead; push needs explicit user yes).
- Schedule impact: today's plan (voice to production, urgency seeds) cannot start until the carryover (docs push, backup rehearsal, migrations) closes. The weekend is the last absorbable slack. Decision due today: execute this weekend, or consciously revise the 15 September bar and say so to Ms Bolanle on Tuesday rather than imply on-track.
- 15 September bar: IN JEOPARDY, recovery requires weekend execution. 18 September go-live: AT RISK if the weekend is also zero; per plan slip rules a MUST slip becomes a cost-in-days conversation with her, never silent.

- Today is Thursday 10 September, Day 2 of GO_LIVE_DAILY_PLAN.md. Day 1 closed ZERO items: all 7 Wednesday items carry to today. Verified: main still 373d4fa, no new commits, all 6 requirements docs still untracked, stash@{0} still unapplied, no progress-log entries beyond the plan's own writing.
- First RED: item 1 (commit and push docs) now 2 days overdue. Owner: user. Nothing else on the plan can be trusted to persist until the baseline is in git.
- Schedule impact: Thursday's client-memory and triage work now shares the day with Wednesday's carryover. Compression decision: docs push + stash decision + backup rehearsal + migrations must close TODAY; voice spike slips to this evening or joins Friday morning; Bolanle/co-dev messages must go before midday.
- 15 September bar: AT RISK if today repeats yesterday. 18 September go-live: still recoverable (weekend buffer absorbs one slipped day).

- Today is Wednesday 9 September, Day 1 of GO_LIVE_DAILY_PLAN.md. Nothing closed overnight (plan was written 02:20 today); yesterday had no plan items.
- Verified: no new commits (main at 373d4fa), all 6 requirements docs still untracked, stash@{0} still unapplied.
- Flagged: item 1 (commit and push docs) not started after 6 hours; owner: user, awaiting go-ahead. Items 6 and 7 (message Bolanle CR-001/CR-002, message co-dev) not sent yet; every hour earlier is answer-time gained before the 15th.
- 15 September bar: no red items yet (Day 1). 18 September go-live: no risk flags yet.

- Wrote `GO_LIVE_DAILY_PLAN.md`: 9 to 18 September, day-by-day, aligned to the 30-day doc's own calendar (its Days 23 to 30 fall exactly on 11 to 18 September). Debt from its slipped Days 15 to 18 block (IDOR, encryption, egress) compressed into 9 to 10 September.
- Verified the schema before planning: advisor_tasks, audit_logs, morning_briefings, commission_ledger, celebrations all exist; voiceTranscription.ts exists but unproven live. Plan is therefore wiring-and-verifying, with three genuinely new tables (client_memory, sla_timers, proposal_versions).
- Rewrote SRS section 8 to match the real schema (was listing tables that already exist).
- Set daily check-in cron 07:43 (f98ce0a4). Session-only, expires 16 September.
- Defined the no-excuses bar for the 15 September update: 8 demonstrable capabilities by Monday 14 EOD, else named risks in the update. Update goes out by 10:00 regardless.

## 2026-09-09: Requirements baseline closed and SRS written

- Ms Bolanle's completed questionnaire received: `New Wave USER_REQUIREMENTS_QUESTIONNAIRE.docx` in Downloads, signed Bolanle Olowookere, 08 September 2026.
- Copied to repo as `USER_REQUIREMENTS_BASELINE_SIGNED_2026-09-08.docx` (241829 bytes). This is the signed scope baseline (satisfies the Days 1 to 2 exit criterion in the 30-day doc).
- Extracted all answers with `/tmp/lanai/read_answers.py` (python-docx, checkbox and filled-line detection). Key answers:
  - 4 pilot clients as personas (high-touch, travel-heavy, event-heavy, quiet-but-important)
  - 3 weeks pilot; WhatsApp only; voice notes MUST day one
  - Working sheet ranked: summary, urgency, history and preferences side by side, suggested reply (next-action and opportunity value NOT wanted in pilot)
  - Memory ranked: travel history, preferences, important dates, past requests, family
  - SLAs: ordinary 2 to 4 hours, urgent 15 to 30 minutes
  - Holding note wording approved verbatim
  - Proactive outbound YES (birthdays, anniversaries, check-ins, travel reminders)
  - No payments; no client-facing app in pilot (but wants to discuss a read-only booking view later, CR-001)
  - Never store: payment card numbers, sensitive family office instructions; offered her own details for pilot testing (CR-002)
  - 2FA, audit trail, duplicate flagging, training 2 to 3 hours, support via WhatsApp or email
  - Grid: rows 1 to 6, 8, 12, 13, 15, 16 MUST; rows 7, 9, 10, 11, 14 SHOULD
- Wrote `PILOT_SYSTEM_REQUIREMENTS.md`: 10 SR areas (SR-100 capture, SR-200 memory, SR-300 triage, SR-400 outbound, SR-500 tasks and briefing, SR-600 lifecycle, SR-700 dashboard, SR-800 security, SR-900 reporting, SR-1000 reliability), 7 NFRs, data model delta (client_memory, important dates, proposal_versions, booking_commission, sla_timers, briefing_cache, audit_log), 21-item acceptance test, traceability matrix, CR register (CR-001 to CR-006).
- Wrote `WEEKLY_UPDATE_TEMPLATE.md` (client-facing, her G3 metrics plus AI-noticed patterns) and this progress log.
- Scheduled a session cron for Tuesday mornings (reminder to prepare and send the update). Session-only; durable mechanism is this log.

## 2026-09-04: Co-developer pull and repo state

- Pulled origin/main: local main fast-forwarded 560476b to 373d4fa, 86 commits. Local branch `bionic/deployment-fixes` intact with 9 local-only commits.
- Stash@{0} "chatwoot-api-in-consumer (pre-main-pull 2026-09-04)" holds +131 lines adding Chatwoot API env reading and HTTP calls to `whatsapp_event_consumer.py`. Verified main's consumer has zero Chatwoot code, so the stash is still novel and applies cleanly in principle. NOT yet applied or pushed.
- Security check on pull: `config/k8s/secrets/.env.secrets` confirmed SOPS-encrypted, no plaintext creds in the pulled tree.
- Notable on main from co-developer: traveler PWA blueprint (`TRAVELER_EXPERIENCE_PWA_ARCHITECTURE_2026-08-22.md`), supplier quote ingestion plan (`SUPPLIER_QUOTE_INGESTION_LLM_IMPLEMENTATION_PLAN_2026-08-22.md`), Drizzle migrations 0004 to 0010, hardened whatsapp_event_consumer (idempotency, leases). Tension to reconcile: traveler PWA blueprint vs 19 August pivot ("digitize the back office, not the relationship"). Bolanle's G2 answer supports it as a post-pilot discussion, so CR-001 is the right vehicle.

## Earlier context (before this log existed)

- 19 August 2026: direction from Ms Bolanle, pivot to back-office copilot, no autonomous AI replies, no client-facing portal for pilot.
- 4 September 2026: solo-operator framing decision (one-person band); questionnaire rewritten, team questions parked as FOR LATER; sent with return-by 6 September; she returned it signed 8 September.
- Repo baseline for the build: main at 373d4fa.
