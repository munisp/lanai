# Lanai Pilot: Developer Handoff

**Date:** 2 October 2026
**Delivered by:** Beryl, with AI co-agents Claude Code and Hermes
**Audience:** the developer taking over the Lanai pilot build

## Mission

Lanai Lifestyle is a concierge travel service run by one advisor, Ms Bolanle Olowookere. The pilot is a single-advisor, four-client, WhatsApp-only run of a back-office concierge copilot. Clients keep using WhatsApp exactly as they always have; the system captures their messages, transcribes voice notes, classifies urgency, drafts replies, and starts response clocks, and Ms Bolanle reviews and sends every single message herself. The AI never sends anything to a client. The success statement from the signed requirements is: "AI can enhance the concierge workflow without replacing the human relationship."

The disqualifiers that define failure are in SRS section 1: messages late or lost, history not findable quickly, replies slower than by hand, client information landing where it should not, generic or wrong AI suggestions, nobody sure what needs doing next, and any added friction for clients.

## Where the truth lives

Read these in order before touching anything:

1. `PILOT_SYSTEM_REQUIREMENTS.md`, document ID LANAI-SRS-PILOT-001 v1.0. This is the build contract. It maps her signed user requirements (UR-xx) to system requirements (SR-nnn), lists the acceptance tests in section 10, and the change-control rules in section 12.
2. `PILOT_PROGRESS_LOG.md`. The running resume log across sessions. The top entry is always the current resume point. Read the top entry first, then as much history as you need.
3. `UPDATE_2026-09-29_TO_MS_BOLANLE.md`. Exactly what the client was told on 29 September, including the two named misses (urgency calibration, holding note wording) and the two decisions asked of her.
4. `audit_reports/ULTRA_LANAI_GAP_AUDIT.md`. Feature gap audit of Lanai against the reference application Ultra Network, with bug findings and a priority list.
5. `DEPLOY_RUNBOOK_PILOT_BRANCH.md` if present, plus `deploy_pilot.sh` itself, which is the real runbook.

## Live system snapshot (verified 2 October 2026)

- Repo: `github.com/munisp/lanai` (note: this repo, NOT berylm1/newfire which other NewFire work uses)
- Branch: `pilot/requirements-baseline-2026-09`
- Origin tip: `f072577` (outbox telemetry feature gates)
- Running portal image: `registry.digitalocean.com/talentgraph-auth/lanai-portal:kasi-20260923-f072577`
- Public URL: `https://lanai.newfire.app` (Cloudflare to in-cluster APISIX to lanai-portal:3001)
- Cluster: KIND cluster `newwave-dev` running in docker on the Minisforum host `america`. SSH as `newwaveclaw@america`.

Cluster topology, all in namespace `lanai` unless noted:

| Pod | Role | Notes |
|---|---|---|
| lanai-portal | Advisor API + client portal, tRPC over Express | 2/2 Running with a dapr sidecar |
| chatwoot | Messaging system of record | Runs Puma only |
| chatwoot-worker | Sidekiq worker for Chatwoot | REQUIRED. It was missing for 53 days and every async job queued forever. Added 30 Sep, commit 0b56360 era |
| chatwoot-postgres | Chatwoot database | |
| keycloak | Advisor identity, realm `lanai` | |
| lanai-ai-gateway | Structured AI invocation | |
| ollama | Local models | No cloud AI, client posture requires local-only |
| twenty | Twenty CRM | Dashboard connection currently broken, see open items |
| postgres | Main database (lanai, keycloak, chatwoot, permify DBs) | Migrations applied through 0013 |
| whisper | faster-whisper-server, local speech to text | ClusterIP only, no Ingress, runs as root in-container (see exceptions) |
| lanai-whatsapp-bridge | Meta Cloud API webhook receiver | Flask, HMAC-SHA256 over raw body, dedup |
| lanai-whatsapp-consumer | Durable outbox consumer | Poll, claim lease, dead-letter, now does whisper transcription too |

## What is verified working

All of this was verified live, not assumed:

- **Full triage loop, 30 Sep:** real Chatwoot message to webhook to mirror row to automatic AI triage (run `triage:msg_8`, urgent, group_booking_issue, 25 seconds) to urgent task to SLA timer. This is the core product loop.
- **Whisper live:** health 200 from inside the portal pod, portal env wired (`TRANSCRIBE_API_URL=http://whisper:8000`, `TRANSCRIBE_MODEL_HINT=small`, `TRANSCRIBE_TIMEOUT_MS=90000`, `SLA_SCHEDULER_ENABLED=true`, `BRIEFING_HOUR=6`).
- **SR-303 seed scenarios:** conv_996001 through conv_996004 on Eleanor Vance, the four calibrated urgency examples.
- **Four persona logins:** eleanor.vance, marcus.chen, sofia.almeida, james.whitfield @example.com, PIN 2026, bookings live in the DB.
- **Advisor sign-in fixed:** advisor@lanai.test had emailVerified=false; fixed in the Keycloak pod via kcadm.sh on 24 Sep.
- **CR-001 My Bookings:** read-only client booking view live (image a9ee782 lineage).
- **SR-306 verbatim holding note and SR-303 last-minute-event calibration:** both fixed in commit e87c42f. The holding note now reads exactly "Thank you for your message. The concierge team has received it and will respond shortly." and the triage prompt now classifies last-minute event requests inside about 48 hours as urgent, matching her football-tickets example.
- **Migrations:** prod journal reconciled by hand from 4 rows to 0010, then 0011 through 0013 applied by the deploy script.

## What is open, in priority order

1. **Member portal login UI loop.** Data layer verified working via API (login 200, myBookings returns LAN-BALI-2026-001) but the browser UI loop is broken. This blocks the CR-001 browser demo for the client.
2. **Briefing stale display after Generate.** The morning briefing page shows stale content after pressing Generate; the upsert itself works.
3. **Dashboard Twenty CRM "Workspace not found."** All dashboard KPIs read zero. Related and bigger: the live Permify service has NO schema loaded, PERMIFY_SCHEMA_VERSION is empty in the pod, the bootstrap script never runs (container CMD is only node dist/index.js), and the SQL-seeded personas lack Permify owner tuples, so every authenticated member and advisor data call fails closed. The full fix plan is written in the "24 September, evening" section of PILOT_PROGRESS_LOG.md: pipe the schema in, run tenancy.create plus schema.write in-pod, capture the schema version, write owner tuples for member ids 1 to 9, set PERMIFY_SCHEMA_VERSION env, re-verify.
4. **Three dead routes that 404:** Revenue Analytics, Confirmation Re-brander, and the Member Portal sidebar link.
5. **Bolanle CR decisions pending.** See the client decisions section below. Do not implement anything there until she rules.
6. **Post-pilot backlog from the ULTRA audit:** kanban pipeline with assignment on Travel Requests, proposal client-link sharing with revocation, supply catalogue facets, Team pages.

## Deploy runbook and hard-won gotchas

READ FIRST. Every item here cost real time to learn.

**Deploying:** run from the Mac, never locally:

```
ssh newwaveclaw@america 'bash -s' < /Users/oluwajobamalomo/lanai/deploy_pilot.sh
```

The script executes on the host. Phases: sync to origin tip, docker build from repo root, runtime layout check, kind load to all three nodes, roll the deployment, run migration, verify tables. On rollout failure it captures pod logs and restores the previous image with an explicit `kubectl set image`.

**kubectl inside KIND:**

```
docker exec newwave-dev-control-plane kubectl -n lanai <verb>
```

**THE STDIN RULE.** Anything that pipes data into a container needs `docker exec -i` AND `kubectl exec -i`, both hops. `docker exec` without `-i` silently discards stdin. psql then receives empty input, exits 0, and an INSERT no-ops while the script prints success. This caused a full day of silent seed failures (29 Sep to 30 Sep). Related: heredocs inside a `bash -s` script piped over ssh share stdin with the script itself and misalign, so never use heredocs in such scripts. Write the SQL to a temp file on the host and pipe the file in: `docker exec -i newwave-dev-control-plane kubectl -n lanai exec -i deploy/postgres -- psql -U lanai -d lanai < /tmp/file.sql`. `seed_pilot_scenarios.sh` shows the working pattern.

**Never `kubectl rollout undo` after an auto-rollback.** The undo would roll FORWARD onto the failed revision. The deploy script handles restoration with an explicit `set image`; stay with that.

**Migrations.** The prod drizzle journal was reconciled by hand (the co-developer had migrated to 0003 then hand-applied everything after without journaling). NEVER run `drizzle-kit push` against prod, and never against the shared test DB before a full-suite run: push and the harness migrations collide on CREATE TYPE. Drop and recreate the test DB and let the harness migrate.

**Pre-existing test noise.** `tsc --noEmit` has 6 known errors (chart.tsx recharts types, stripeRouter version pin), none new from pilot work. `triageService.test.ts` fails locally with "DATABASE_URL is required" unless the disposable test DB is running.

**AI generation corruption risk.** Long single-shot file generations from AI agents can corrupt mid-file (happened 24 Sep and 29 Sep, recovered both times). Recovery pattern: delegate file authoring to fresh subagents, do wiring with small python3 replace scripts, and verify with git diff before commit.

## Security posture and pilot exceptions

Every exception below was accepted deliberately and logged. Do not add new ones silently; permanent fixes are tracked.

- `PERMIFY_TRUSTED_INSECURE=true`: plaintext gRPC inside the cluster network under a reviewed exception. Permanent fix: distribute the permify-secure-proxy CA to portal pods, then switch to port 8443 with PERMIFY_INSECURE=false.
- `CHATWOOT_ALLOW_INSECURE_URL=true`: cluster-internal http from portal to Chatwoot. The public hostname TLS certificate is not trusted from inside the pod.
- Whisper container runs as root: the image keeps its application under /root/ which is unreadable by non-root uid 1001. Caps dropped, no privilege escalation, ClusterIP only, no Ingress, no browser traffic.
- Postgres egress policy selector currently matches nothing (commit c71c9ef), so it constrains nothing yet.
- `OUTBOX_FLUVIO_DISABLED=true` and `OUTBOX_LAKEHOUSE_DISABLED=true`: domain events are carried by dapr; these gates stop them dead-lettering on degraded backends.

**Secrets never leave pods.** Keycloak changes run kcadm.sh inside the keycloak pod using the $KC_BOOTSTRAP_ADMIN_USERNAME and $KC_BOOTSTRAP_ADMIN_PASSWORD env vars. The WhatsApp consumer derives DATABASE_URL from the POSTGRES_PASSWORD secret (commit 305c3ad). Nothing is materialized in logs or transcripts.

**Hard rules:** SR-204, payment card numbers and sensitive family office instructions are never stored anywhere. SR-401, no auto-send path exists anywhere in the system; a violation is a release NO-GO.

## Working with the AI co-agents

- **Hermes** does browser-verified live testing and reports findings with exact evidence. Trust but verify: it correctly caught the missing /triage route and the paraphrased holding note that Claude Code had shipped unregistered.
- **Claude Code** writes code and runs infrastructure. Session memory plus PILOT_PROGRESS_LOG.md are the resume points.
- The z-ai classifier occasionally blocks write-shaped Bash in waves while read-only commands pass. Retry after a few minutes, or ask Beryl to run the command herself with the ! prefix in the terminal.

## Pending client decisions (UR-H3: she is the single scope decision maker)

Do not change anything here without her ruling, and implement her ruling either way once given:

1. **SLA window.** Code currently gives urgent messages 40 minutes to first response and 20 to warn, ordinary 6h/3h. Her questionnaire says 15 to 30 minutes urgent, 2 to 4 hours ordinary. She was asked on 29 Sep which window she wants.
2. **Urgency tiers.** She specified two levels (urgent, ordinary). She was asked whether to keep two or add a middle "soon" level. Recommendation was to keep two for the pilot.
3. Anything else in section 11 of the SRS (the CR register). Email channel, research assistance, and surfacing next-action and opportunity value are all agreed LATER.