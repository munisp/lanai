# Lanai Go-Live Daily Plan: 9 to 18 September 2026

**Deadline:** production release, Friday 18 September 2026 (30-day plan Day 30)
**Today:** Wednesday 9 September 2026 (30-day plan Day 21)
**Build contract:** `PILOT_SYSTEM_REQUIREMENTS.md` (LANAI-SRS-PILOT-001 v1.0)
**Gate register:** 30-day doc P0-01 to P0-13 (preserved on `bionic/deployment-fixes`)
**Tuesday milestone:** first client update to Ms Bolanle, Tuesday 15 September, by 10:00, no exceptions

---

## 1. Where we actually stand (honest baseline, checked today)

| Area | State | Evidence |
|---|---|---|
| WhatsApp capture, text, end to end | DONE, verified 3 Sep | Meta Cloud API to bridge to outbox to consumer to timeline |
| Core schema | LARGELY EXISTS | advisor_tasks, audit_logs, morning_briefings, commission_ledger, celebrations, conversations, messages, aiInsights, travelRequests, proposals, bookings all in `schema.ts` |
| Voice transcription | MODULE EXISTS, NOT PROVEN LIVE | `lanai-portal/server/_core/voiceTranscription.ts`; never run through the live pipeline |
| Client memory grounding | NOT BUILT | No client_memory table; `aiInsights` is generic; P0-13 open |
| Structured AI triage | OPEN | P0-13: gateway must return structured triage, no text-only stub |
| IDOR closures, PII encryption, egress removal | OPEN | P0-11, P0-12 (the doc's Days 15 to 18 block, due 6 Sep, slipped) |
| Backup and rollback rehearsal | OPEN | P0-10 |
| Integration tests as a release gate | OPEN | P0-06, mocked smoke suites must be replaced (doc Days 23 to 25) |
| Requirements baseline | DONE | Signed 8 Sep; SRS v1.0 written 9 Sep; docs not yet committed to git |
| Backup: requirements docs | NOT IN GIT | 6 files untracked in the working tree; commit and push today |

**Net position:** roughly 3 to 5 days behind on the security and privacy block and voice, but ahead on capture and schema. The compressed plan below absorbs the debt into 9 to 10 September, then rides the 30-day doc's own calendar for the back half (its Days 23 to 30 fall exactly on 11 to 18 September).

## 2. How to work this plan

**Definition of done.** An item is done when the matching acceptance item (SRS section 10) or release-gate line has been executed and the evidence is logged in `PILOT_PROGRESS_LOG.md`. Code written is not done. Tested and logged is done.

**Daily rhythm (small, fixed, non-negotiable).**
- Morning, 10 minutes: open this file, tick what closed yesterday, read today's list.
- Evening, 5 minutes: one progress-log line per closed item, then push.
- A session cron nudges this at 07:43 daily (session-only, expires 16 September; after that, the rhythm is yours until the 18th).

**Two tracks (split if your co-developer has capacity; otherwise the order below is the critical path).**
- Track YOU (AI and product): client memory, structured triage, working sheet, urgency, voice, rehearsal.
- Track CO-DEV (platform and security): IDOR closures, encryption at rest, egress removal, secrets, deploy validation, test gates, topology matrix.

**Slip rules, decided now so no decision is needed under pressure.**
- MUST items never slip. If a MUST is threatened, it goes to Ms Bolanle the same day as a cost in days (UR-H2), never silently absorbed.
- These SHOULDs slip to pilot week 1 if the MUST path is threatened, in this order: SR-504 morning briefing (send a manual morning list instead), SR-602 proposal version history, SR-207 AI-noticed patterns, SR-702 search beyond basic, SR-901 automated weekly summary (compile by hand for the first update).

**Change control.** Anything new that appears mid-week becomes a CR-xx in the SRS the same day. Nothing gets built silently.

---

## 3. Day by day

### Wednesday 9 September (today), doc Day 21: lock the plan, secure the base

| # | Item | Traces to | Done when |
|---|---|---|---|
| 1 | Commit and push all 6 requirements docs (SRS, signed baseline, questionnaire, progress log, weekly template, this plan) | baseline integrity | pushed to the lanai repo |
| 2 | Decide the stash `chatwoot-api-in-consumer`: apply to main and test, or discard with a note. Recommended: apply, it is novel and Chatwoot API calls serve SR-402 delivery status | SR-402 | applied and consumer tested, or discard note logged |
| 3 | Backup and restore rehearsal: take a restorable backup, restore into a scratch DB, record the rollback command in the progress log | P0-10, SR-1005 | restore verified, command recorded |
| 4 | Migrations 0011 onward (only after item 3 passes): client_memory, sla_timers, proposal_versions, plus the extensions in SRS section 8 | SR-201, SR-502, SR-602 | migrations applied, schema check passes |
| 5 | Voice spike: push one real voice note through the live pipeline via `voiceTranscription.ts`; log the result. This sizes tomorrow's work | SR-102 | spike result (works / breaks / missing config) in the log |
| 6 | Message Ms Bolanle the two CR questions today, not on the 15th: CR-001 client booking view, CR-002 pilot data policy. Defaults stand meanwhile (after pilot; synthetic personas) | CR-001, CR-002, UR-H3 | sent via WhatsApp or email |
| 7 | Message co-developer: share the SRS and this plan, propose the track split, raise CR-006 (restore the 30-day docs to main) | CR-006 | message sent |

### Thursday 10 September, doc Day 22: client memory and the triage engine

| # | Item | Traces to | Done when |
|---|---|---|---|
| 1 | client_memory service and capture hooks: every message updates the record without re-typing; duplicate flag for manual merge | SR-201, SR-202, SR-203 | a real message adds a memory entry; near-duplicate flags |
| 2 | Field exclusions at entry: validation rejects payment card numbers and family office instructions, nothing reaches a prompt | SR-204 | acceptance item 13 passes |
| 3 | Structured AI triage persisted, grounded in client_memory; remove any text-only stub | SR-301, P0-13 | a real message produces a persisted structured run |
| 4 | Working sheet payload in her exact rank order: summary, urgency, history and preferences side by side, draft. Next-action and opportunity value persisted, not surfaced | SR-302, UR-C2 | payload visible in the conversation screen for a real message |
| 5 | Grounding guardrails: no invented prices, availability, bookings, supplier commitments | SR-304, UR-C4 | acceptance item 12 passes |
| 6 | Co-dev track if available: IDOR closures (chatwoot.getMessages, storageProxy, row-level isolation), PII encryption at rest, remove `forge.manus.im` fallback | P0-11, P0-12, SR-803, SR-805 | probes fail; sensitive fields ciphertext; no egress |

### Friday 11 September, doc Day 23: voice to production and urgency

| # | Item | Traces to | Done when |
|---|---|---|---|
| 1 | Voice transcription end to end on the live stack: transcript persisted with the audio reference; corrupted audio produces a flagged task, never silence | SR-102, P1-10 | acceptance item 2 passes (both paths) |
| 2 | Urgency classification calibrated on her four seed scenarios: flight cancellation with hotel knock-on, restaurant tonight, last-minute tickets, hotel cannot find a group booking | SR-303, UR-B4 | all four classify urgent |
| 3 | SLA timers started at capture: urgent 15 to 30 minutes, ordinary 2 to 4 hours; aging visible | SR-502, UR-B5 | timer rows created per request; aging indicator renders |
| 4 | Unknown-contact hold verified live: nothing created until she approves; approval reversible | SR-103, UR-B6 | acceptance item 5 passes |
| 5 | Holding note one-tap with her exact approved wording | SR-306, UR-C5 | acceptance item 9 passes |
| 6 | Task triggers wired: urgent arrival, brand new client, complaint, AI failure, promised date reached, time-sensitive ask | SR-501, UR-D3 | each trigger produces a task in a test |

**Weekend 12 to 13 September (doc Days 24 to 25): release candidate, capped.**
Replace or quarantine the mocked smoke suites; run the Compose-backed integration suites and the release-gate scripts unmocked for P0 features; run type check, production build, migration consistency, contract smokes; publish reports (P0-06). Buffer for anything owed from Thursday or Friday. Cap at about 4 hours per day; Monday needs fresh eyes.

### Monday 14 September, doc Day 26: rehearsal day and the no-excuses bar

| # | Item | Traces to | Done when |
|---|---|---|---|
| 1 | Seed the 4 personas as synthetic records (CR-002 policy): high-touch, travel-heavy, event-heavy, quiet-but-important, with rich memory, dates, one booking each | UR-A2, CR-002 | 4 seeded clients, journey-ready |
| 2 | Run the full concierge journey live with real WhatsApp including a voice note: capture, triage, working sheet, her review, send, lifecycle states | P0-05, UR-A1 | journey passes without engineering intervention |
| 3 | Fix only release blockers; everything else becomes a classified defect | doc Day 26 | blocker list with owners |
| 4 | Evening: run the no-excuses bar (section 4). Anything red is written into tomorrow's update as a named risk, never hidden | integrity rule | bar results in the log |

### Tuesday 15 September, doc Day 27: UPDATE DAY (the milestone)

**Before 10:00:** fill Mode A of `WEEKLY_UPDATE_TEMPLATE.md` from the progress log and send to Ms Bolanle. Log her CR-001 and CR-002 answers the same day if they have arrived; update the SRS CR register.

**The update contains, whatever else is true:** what is demonstrably working (named, from the bar below), what comes next week, the timeline check against 18 September, and her two decisions if still open. It goes out by 10:00 even if the news is mixed; what it never is, is silent, late, or vague.

**Rest of the day:** draft her 2 to 3 hour training outline (UR-G4); fix client-facing copy (the "concierge reviews every reply" guarantee, remove any auto-reply claim, doc Day 26 task); publish the support path (UR-G5).

### Wednesday 16 September, doc Day 28: rehearsal complete, SHOULD items

1. Close rehearsal defects; only release blockers get engineering time.
2. SHOULD items in order, only while green: morning briefing (table exists) SR-504; proposal status and versions SR-601/602; proactive templates for birthdays, anniversaries, check-ins, travel reminders SR-403 (celebrations table exists).
3. Dry-run the full 21-item acceptance suite (SRS section 10); classify every failure P0, P1, or P2.

### Thursday 17 September, doc Day 29: freeze and go or no-go

1. Code and configuration freeze; final backup.
2. Rehearse deploy, migration, smoke, rollback, and restore (P0-10).
3. Full acceptance run on the release candidate; evidence logged per item.
4. Go/no-go checklist (section 5) signed by you (and co-dev where owned); support rota and incident channel confirmed.

### Friday 18 September, doc Day 30: production release

1. Deploy the approved release; verify all rollouts and jobs.
2. Public endpoint, auth, CRM, Chatwoot, AI, WhatsApp, voice, proposal smoke tests.
3. One real controlled WhatsApp message and one voice note, end to end, with Ms Bolanle on the concierge side.
4. Monitor the first operating window continuously; post-release review; publish known limitations.
5. Pilot is live. First Mode B weekly update: Tuesday 22 September.

---

## 4. The no-excuses bar for 15 September (must be demonstrable by Monday 14 EOD)

Each line is either green (demonstrated, logged) or red (named risk in the update, with owner and recovery date):

1. Text message captured exactly once, from each of the 4 personas (SR-101; acceptance 1)
2. Voice note transcribed, original audio retrievable; corrupted audio becomes a flagged task (SR-102; acceptance 2)
3. Unknown number held for review, nothing auto-created (SR-103; acceptance 5)
4. Working sheet shows her four ranked sections from a real message (SR-302; acceptance 1)
5. Draft is editable, send is human-only, delivery status visible (SR-401, SR-402; acceptance 1, 21)
6. The four urgency seeds classify urgent (SR-303; acceptance 7)
7. Holding note one-tap with the exact approved wording (SR-306; acceptance 9)
8. 2FA enforced; IDOR probes fail; sensitive fields ciphertext at rest; no third-party egress (SR-801, SR-803, SR-805; acceptance 14, 21)

Eight green lines is an "on track" update. Reds are named, owned, and dated. The update is never held hostage to perfection; silence and vagueness are the only unacceptable outcomes.

## 5. Go or no-go gate (17 to 18 September), condensed

- [ ] Every P0-01 to P0-13 closed (P0-02 to P0-04 evidenced by the 3 Sep E2E run; the rest by this plan's items)
- [ ] Secrets rotated and injected via SOPS; nothing plaintext in repo or runbook (P0-07, SR-805)
- [ ] Backup and restore verified; rollback command tested (P0-10, SR-1005)
- [ ] Duplicate webhook delivery is idempotent (SR-1002; acceptance 6)
- [ ] AI triage structured and grounded, not a stub (P0-13, SR-301, SR-304)
- [ ] AI fails safely: model outage produces the holding note and a follow-up task (SR-305, SR-306; acceptance 9)
- [ ] No outbound message can reach a client without her review (SR-401; acceptance 21)
- [ ] Travel request to proposal to booking journey passes advisor-side (SR-601 to SR-604; acceptance 17)
- [ ] Cross-record access impossible; PII ciphertext; 2FA on; no latent egress (P0-11, P0-12, SR-803, SR-805; acceptance 14, 21)
- [ ] Payments and email explicitly out of scope (UR-G1, UR-B1, CR-003)
- [ ] Monitoring active with named alert ownership (SR-1003)
- [ ] Client-facing copy states the concierge-review guarantee and promises no automation (doc Day 26)
- [ ] Bolanle trained (2 to 3 hours, UR-G4) and support path live (UR-G5)

## 6. Risks with pre-agreed fallbacks

| Risk | Fallback, pre-agreed |
|---|---|
| Voice transcription quality or latency | Separate background worker; portal shows playable audio with a "transcribing" state, transcript lands minutes later. Capture reliability (the MUST) is unaffected. If day-one voice is still threatened by the 16th, that is a cost-in-days conversation with Ms Bolanle, per UR-H2 |
| AI drafts feel generic (her disqualifier) | Memory quality before model swaps: rich seeded personas, tighter grounding prompts. Rehearsal exists precisely to catch this before she does |
| Ms Bolanle slow to answer CR-001/CR-002 | Defaults apply (after pilot; synthetic personas) and the update says so |
| Co-developer unavailable for the security track | Sequential order takes over: security items move to Friday 11 and the weekend buffer; the 16th's SHOULD items are the sacrifice |
| A MUST fails on the 17th | It does not ship hidden. Go becomes no-go or a scope exception is agreed with her the same day, per the change rules |

## 7. What happens after the 18th

Pilot runs 3 weeks from go-live (18 September to about 9 October). Tuesday updates switch to Mode B numbers: 22 September, 29 September, 6 October. Judgment date for her: about 9 October. The daily plan then retires; the weekly cadence and `PILOT_PROGRESS_LOG.md` take over.
