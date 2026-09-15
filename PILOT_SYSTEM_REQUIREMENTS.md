# Lanai Lifestyle: Pilot System Requirements Specification

**Document ID:** LANAI-SRS-PILOT-001
**Version:** 1.0 (requirements baseline)
**Date:** 9 September 2026
**Status:** Agreed baseline, derived from the signed user requirements questionnaire (Bolanle Olowookere, 8 September 2026)
**Source documents:**
- `USER_REQUIREMENTS_BASELINE_SIGNED_2026-09-08.docx` (signed UR baseline, this repo)
- `30_DAY_GO_LIVE_TECHNICAL_REQUIREMENTS.md` (delivery plan and gap register; deleted from main but preserved on branch `bionic/deployment-fixes`)
- Current `main` architecture (co-developer state, commit `373d4fa`): portal TypeScript server, Chatwoot webhooks, WhatsApp event consumer, AI gateway, Twenty CRM, Keycloak, PostgreSQL via Drizzle
**Owner:** Lanai delivery owner
**Change control:** Section 12. Any change during the pilot build or pilot run becomes a CR-xx entry; nothing is built silently.

---

## 1. Scope statement

The pilot is a **single-user, four-client, three-week, WhatsApp-only** run of the back-office concierge copilot.

| Parameter | Value | Source |
|---|---|---|
| Operator | Ms Bolanle only (one advisor account) | Single-user decision, 4 Sep; F2 marked for later |
| Clients in pilot | 4, selected as personas: one high-touch (frequent WhatsApp and voice), one travel-heavy, one event-heavy, one quiet but important whose history matters | UR-A2 |
| Duration | 3 weeks from pilot start | UR-A5 |
| Channels | WhatsApp only (text, voice notes, photos, documents, screenshots). Email deferred | UR-B1, UR-B3 |
| Payments | None. No payment step anywhere in the pilot | UR-G1 |
| Client-facing surface | None. Clients keep using WhatsApp exactly as they always have. No app, no login | UR-G2, CR-001 |
| AI autonomy | Zero. The AI drafts; Bolanle reviews and sends every message | UR-C1, grid row 3 |
| Success statement | "AI can enhance the concierge workflow without replacing the human relationship" | UR-A1 |

**Disqualifiers (any one makes the pilot "not ready", UR-A4):** messages late or lost; client history not findable quickly; replies slower than answering by hand; client information ends up where it should not be; AI suggestions generic or wrong; nobody sure what needs doing next; any change to how clients interact with Lanai or any added friction to their experience.

## 2. Requirement ID scheme

- **UR-xx**: user requirement, from the signed questionnaire (section 3).
- **SR-nnn**: system requirement, this document (section 5). SRs are the build contract.
- **CR-xx**: change request, logged in section 11 during build and pilot.
- Traceability: every SR lists the UR it serves and the 30-day plan item it satisfies (section 9 matrix).

Priority labels follow the signed grid: **MUST** (build first, pilot fails without it), **SHOULD** (build in pilot window if capacity allows), **LATER** (recorded, built after pilot).

---

## 3. User requirements register (from the signed baseline)

| UR | Area | Her answer (condensed, exact intent) | Priority |
|---|---|---|---|
| UR-A1 | Success | Pilot proves AI enhances the concierge workflow without replacing the human relationship | gate |
| UR-A2 | Clients | 4 clients: high-touch, travel-heavy, event-heavy, quiet-but-important (history matters) | MUST |
| UR-A3 | Load | Biggest daily loads: capture to structured tasks; remembering preferences (rooms, airlines, dining, children, allergies, budgets, patterns); searching past conversations for promises; research; follow-ups and reminders; drafting polished replies; manual record updates; context switching; chasing commissions | drives SRs |
| UR-A4 | Failure | All six listed disqualifiers plus: no added client friction | gate |
| UR-A5 | Duration | 3 weeks | MUST |
| UR-B1 | Channel | WhatsApp only; email later | MUST |
| UR-B2 | Voice | Voice notes transcribed from day one | MUST |
| UR-B3 | Types | Text, voice, photos, documents, occasional screenshots | MUST |
| UR-B4 | Urgency | Time sensitivity or risk of client inconvenience; examples: flight cancellation with hotel knock-on, last-minute restaurant tonight, last-minute football tickets, hotel cannot find a group booking | MUST |
| UR-B5 | SLA | Ordinary request answered in 2 to 4 hours; urgent in 15 to 30 minutes | MUST |
| UR-B6 | Unknown sender | Hold for review before anything is created | MUST |
| UR-B7 | Proactive | She will start conversations: birthdays, anniversaries, check-ins, travel reminders | MUST |
| UR-C1 | Guarantee | No client message is sent without her review | MUST |
| UR-C2 | Working sheet | Ranked: 1 summary, 2 urgency, 3 client history and preferences side by side, 4 suggested reply. Next-action suggestion and opportunity value are NOT wanted in the pilot | MUST |
| UR-C3 | Memory | Ranked: 1 travel history, 2 preferences, 3 important dates, 4 past requests and complaints, 5 family members | MUST |
| UR-C4 | Grounding | AI never states prices, availability, bookings, or supplier commitments as confirmed without source data | MUST |
| UR-C5 | Fallback wording | Approved: "Thank you for your message. The concierge team has received it and will respond shortly." | MUST |
| UR-D1 | Dashboard order | Most urgent messages first | MUST |
| UR-D2 | Conversation screen | Full history, AI working sheet, profile and preferences, open requests with status, past proposals and bookings, plus key personal context (family, dates, preferences) surfaced at top | MUST |
| UR-D3 | Task triggers | Urgent message; brand new client; complaint; AI could not process; promised follow-up date reached; client asks for something time-sensitive ("remind me tomorrow") | MUST |
| UR-D4 | Morning content | Overnight messages with urgency; today's follow-ups and promised dates; urgent flagged on top; birthdays and important dates coming up; stalled tasks and items waiting on suppliers | SHOULD |
| UR-E1 | Lifecycle | Request received, Proposal sent, Client approved, Booked, Follow-up | SHOULD |
| UR-E2 | Proposals | Saved document with status (pilot); version history desired ("would like to achieve this") | SHOULD |
| UR-E3 | Bookings | She confirms every booking herself | MUST |
| UR-E4 | Confidentiality | Internal notes and commercial data never client-visible; hard rule | MUST |
| UR-E5 | Trip follow-up | Thank-you message; feedback request; record preferences learned; suggest next trip from history; flag issues raised during the trip for future avoidance | SHOULD |
| UR-F1 | Sensitive data | All seven: passport, date of birth, home address, emergency contacts, family office details, payment details, travel patterns | MUST |
| UR-F2 | Future roles | For later: senior sees all, others see only assigned clients | LATER |
| UR-F3 | Duplicates | Flag for manual merge | MUST |
| UR-F4 | Never stored | Payment card numbers; sensitive family office instructions. She offers her own details for pilot testing | MUST |
| UR-F5 | Audit | Audit trail on: who saw what, who sent what, when | MUST |
| UR-G1 | Payments | None in pilot | MUST |
| UR-G2 | Client surface | Confirmed WhatsApp only; wants to discuss a future read-only client view of bookings | see CR-001 |
| UR-G3 | Weekly numbers | Messages received and answered; fastest and average response time; requests opened and completed; proposals sent and approved; trips booked; anything she had to chase manually; AI-noticed repeated patterns (frequent destinations, hotel brands) | SHOULD |
| UR-G4 | Training | 2 to 3 focused hours before pilot start | MUST |
| UR-G5 | Support | WhatsApp or email to the delivery team | MUST |
| UR-H1..H4 | Change control | Change log agreed; default answer is after-pilot; she is the single scope decision maker; weekly review Tuesday mornings | MUST |
| UR-I1..I16 | Grid | Rows 1 to 6, 8, 12, 13, 15, 16 = MUST; rows 7, 9, 10, 11, 14 = SHOULD | MUST/SHOULD |

## 4. System context (what exists, what is built)

The pilot rides on the hardened `main` architecture. Nothing in this SRS requires re-architecture; it specifies the pilot surface on top of it.

| Component (existing on main) | Role in pilot |
|---|---|
| Portal TypeScript server (`lanai-portal/server`) | Advisor-facing API, routers, session handling |
| `chatwootWebhook.ts`, `chatwootService.ts`, Chatwoot | Messaging system of record; inbound and outbound WhatsApp |
| `whatsapp_event_consumer.py`, `whatsapp_ai_bridge.py` | Idempotent capture, outbox processing, AI triage invocation |
| AI gateway (`lanai_ai`) | Structured triage and draft generation, grounded in client memory |
| Twenty CRM + `crmSyncService.ts`, `crmProjection.ts` | Client record sync |
| Keycloak (`config/keycloak/lanai-realm.json`) | Single advisor login, TOTP 2FA |
| PostgreSQL + Drizzle migrations 0004 to 0010 | whatsapp_webhook_events, outbox and consumer leases, chatwoot_webhook_events |
| New in pilot | Voice transcription step, client-memory tables and prompts, task and briefing rules, working-sheet UI, SLA timers, weekly summary, audit log for sensitive reads |

## 5. Functional requirements

### SR-100: Message capture and ingest

- **SR-101 (MUST)** Every inbound WhatsApp message (text, voice note, photo, document, screenshot attachment) is captured and persisted exactly once, before any AI processing. Original audio reference and attachment references are stored. [UR-B2, UR-B3; 30-day 6.2]
  - Accept: duplicate webhook delivery produces zero duplicate local messages (replay test); attachment and transcript retrievable after refresh.
- **SR-102 (MUST)** Voice notes are transcribed to text automatically by a speech-to-text step in the same pipeline. The transcript and the original audio reference are both persisted. Transcription failure does not lose the message: it enters the review queue flagged "transcription failed". [UR-B2]
  - Accept: a voice note arrives, transcript appears with the message within the processing timeout; a corrupted voice note produces a flagged task, not silence.
- **SR-103 (MUST)** Messages from unrecognized phone numbers are held in a review queue. No client record, contact, or CRM entry is created until Bolanle approves. Her approval creates the record visibly and reversibly. [UR-B6; 30-day 6.2]
- **SR-104 (MUST)** Each message is linked to its client record and to the Chatwoot conversation. Correlation ID chains provider message to local message to AI run to task to outbound message. [UR-B3; 30-day 6.3]
- **SR-105 (MUST)** Capture never adds client-visible friction: clients send WhatsApp exactly as today. No opt-in, no app, no keyword, no greeting menu. [UR-A4, UR-G2]

### SR-200: Client memory and records

- **SR-201 (MUST)** Each client record holds: contact details, travel history (stays, what they loved), preferences (airline seats, room types, dietary needs, children, allergies, budgets, patterns), family members and how to address them, important dates (birthdays, anniversaries), past requests and complaints. Ranked display order per UR-C3. [UR-C3, UR-A3]
- **SR-202 (MUST)** Client records are created and kept in step automatically: message interactions update the record without manual re-typing. [grid row 8, UR-A3 item "updating client records manually"]
- **SR-203 (MUST)** Probable duplicate records (repeated phone number, spelling variance) are flagged for manual merge by Bolanle. No automatic merge. [UR-F3]
- **SR-204 (MUST)** Field-level exclusion: payment card numbers and sensitive family office instructions are never accepted into any field, table, attachment index, or AI prompt. Input validation rejects them at entry. [UR-F4; 30-day P0-12]
- **SR-205 (MUST)** Encrypted at rest: passport details, date of birth, home address, emergency contacts, family office contact details, payment details reference, travel patterns. Keys from the approved secret manager (SOPS/K8s Secrets pattern already on main). [UR-F1; 30-day P0-12]
- **SR-206 (MUST)** CRM sync stays idempotent: Lanai record updates reflect into Twenty without duplicates; CRM failure never loses the originating message or request (outbox pattern already on main). [30-day 5.3]
- **SR-207 (SHOULD)** AI-noticed patterns (frequent destinations, hotel brands, repeated party composition) are accumulated as memory entries dated and sourced, reviewable by Bolanle before they influence drafts. [UR-G3 item 7]

### SR-300: AI triage and drafting (the working sheet)

- **SR-301 (MUST)** For every inbound message the AI gateway produces a persisted structured triage run: intent, urgency, sentiment, summary, suggested tags, draft reply. The full schema is persisted even though the pilot UI surfaces the subset in SR-302. [30-day 6.3; UR-C2]
- **SR-302 (MUST)** The working sheet shown to Bolanle contains exactly, in rank order: (1) short summary of what the client wants; (2) urgency level; (3) client history and preferences side by side with the message; (4) a suggested reply she can edit. No suggested-next-action card and no opportunity-value estimate in the pilot UI. [UR-C2]
- **SR-303 (MUST)** Urgency classification follows her definition: time sensitivity or risk of client inconvenience. Calibrated with her examples: flight cancellation with hotel knock-on; last-minute restaurant tonight; last-minute event tickets; hotel cannot find a group booking. These four are seeded test scenarios. [UR-B4]
- **SR-304 (MUST)** Grounding: drafts are generated only from supplied client facts (client memory, conversation, documents she has stored). The AI never states prices, room or flight availability, booking confirmations, or supplier commitments as confirmed without source data in context; unsupported claims are marked as assumptions or omitted. [UR-C4; 30-day 5.5]
- **SR-305 (MUST)** Every AI request has an authenticated caller, request ID, bounded input, processing timeout, bounded retry, and dead-letter to review state after repeated failure. A failed AI run creates a task (see SR-501) and the raw message stays fully usable. [30-day 5.5, 6.3]
- **SR-306 (MUST)** When AI is unavailable or times out, the approved holding note is available for one-tap send, exactly: "Thank you for your message. The concierge team has received it and will respond shortly." Wording changes only via CR. [UR-C5]
- **SR-307 (MUST)** No AI output reaches a client. The send path is human-only (SR-401). The system never replies to its own outbound messages. [UR-C1; 30-day 6.4]

### SR-400: Concierge review and outbound

- **SR-401 (MUST)** Every outbound message requires an authenticated send action by Bolanle after viewing the draft. There is no auto-send path, no scheduled send, no bypass. This is a release NO-GO condition if violated. [UR-C1; 30-day 6.4]
- **SR-402 (MUST)** Outbound responses are sent from the same WhatsApp sender within the conversation; provider message ID and delivery status are persisted; failed delivery is visible, retryable, and escalates to a task. [30-day 6.4]
- **SR-403 (MUST)** Proactive outbound (she starts conversations: birthdays, anniversaries, check-ins, travel reminders): the system supports business-initiated WhatsApp messages, using pre-approved Meta message templates for messages outside the 24-hour customer service window. Template list is configurable and audited. [UR-B7; 30-day 6.4]
- **SR-404 (MUST)** Internal notes, supplier costs, and commission data are structurally excluded from every client-facing surface and from AI draft context unless explicitly marked shareable. Hard rule. [UR-E4]

### SR-500: Tasks, SLA timers, and the morning briefing

- **SR-501 (MUST)** Tasks are created automatically when: an urgent message arrives; a brand new client appears; a complaint is detected; an AI run fails; a promised follow-up date is reached; a time-sensitive request is detected (for example "remind me tomorrow" produces a dated reminder task). [UR-D3]
- **SR-502 (MUST)** SLA timers per open request: urgent, answer within 15 to 30 minutes; ordinary, within 2 to 4 hours. Aging is visible on the dashboard; approach to breach changes the indicator; breach creates an alert task. Response times feed the weekly summary. [UR-B5, UR-G3; UR-A4 "messages arrive late"]
- **SR-503 (MUST)** Dashboard ordering: most urgent first, then by SLA risk, then newest. [UR-D1]
- **SR-504 (SHOULD)** Morning briefing, generated daily, containing: overnight messages with urgency marks; today's follow-ups and promised dates; urgent items flagged on top; upcoming birthdays and important dates; stalled tasks (no state change in 3 days by default, configurable) and items flagged waiting-on-supplier. [UR-D4]
- **SR-505 (MUST)** Task ownership is unambiguous: with one operator every task is hers; the owner field still exists and is stamped, so the future team model (UR-F2) needs no migration. [UR-A4 "nobody is sure what needs doing next"]

### SR-600: Travel request, proposal, booking lifecycle

- **SR-601 (SHOULD)** Lifecycle states exactly: Request received, Proposal sent, Client approved, Booked, Follow-up. Status changes are validated and recorded with timestamps. [UR-E1]
- **SR-602 (SHOULD)** Proposals: a saved document per proposal with status draft, sent, approved, declined. Version history increments and retains each revision. [UR-E2]
- **SR-603 (MUST)** Bookings are confirmed by Bolanle only. Booking confirmation creates a durable booking record linked to the request, proposal, documents, and supplier. [UR-E3; 30-day 5.4]
- **SR-604 (SHOULD)** Booking records carry an expected commission amount and status, so post-stay commission chasing has a home. A follow-up reminder is generated after the stay ends. [UR-A3 "chasing commissions"]
- **SR-605 (SHOULD)** Post-trip follow-up reminders: thank-you message; feedback request; record preferences learned; suggest next trip from history; flag any issues raised during the trip for future avoidance (issues become memory entries tagged "issue"). [UR-E5]
- **SR-606 (MUST)** An advisor-side request can be created on a client's behalf directly from a captured message or task (one flow, no re-typing). [UR-A3 item 1; 30-day 5.4]

### SR-700: Dashboard and conversation screen

- **SR-701 (MUST)** One conversation screen shows, on a single surface: full message history with that client; the AI working sheet (SR-302); client profile and preferences; open requests with status; past proposals and bookings; key personal context (family, dates, preferences) surfaced at the top of the record panel. [UR-D2]
- **SR-702 (MUST)** Search across past conversations and client memory returns promises and pending items quickly (target: findable in seconds, not minutes; this answers UR-A3 "searching past conversations"). Full-text search over messages, notes, and memory entries. [UR-A3, UR-A4]
- **SR-703 (MUST)** Context switching is reduced by one unified queue across travel, events, logistics, and personal requests (no per-domain views in the pilot). [UR-A3 item 8]

### SR-800: Security, privacy, access

- **SR-801 (MUST)** Single advisor account: Bolanle, in Keycloak, with TOTP two-step verification enforced as a required action. No other advisor accounts exist in the pilot environment. [grid row 13; single-user decision]
- **SR-802 (MUST)** Permission model stays in the codebase (Permify row-level checks) but no pilot effort is spent on multi-advisor workflows. Recorded future state: senior sees all, others see assigned clients only. [UR-F2; single-user decision]
- **SR-803 (MUST)** Cross-record access by ID manipulation is impossible (IDOR closed, tested). This is a release NO-GO condition. [30-day P0-11, 5.2; UR-A4 "client information ends up where it should not be"]
- **SR-804 (MUST)** Audit trail records: message send and receive; draft edit and send; record views (who saw what, including sensitive fields); record edits; proposal and booking state changes; login attempts. Audit entries are append-only. [UR-F5, grid row 15]
- **SR-805 (MUST)** No latent third-party egress: no external model or fallback endpoints beyond the approved gateway; the `forge.manus.im` class of fallback stays removed. Secrets rotated and injected via SOPS/K8s Secrets; no plaintext credentials in the repo. [30-day P0-12, 7.3]
- **SR-806 (MUST)** Session cookies secure, signed, HTTP-only, same-site appropriate, predictable expiry; webhook signature validation before processing; rate limits on public endpoints. [30-day 5.2, 7.3]
- **SR-807 (MUST)** Provider tokens (Meta, Chatwoot, Twenty) are never exposed to the browser. [30-day 6.1]

### SR-900: Reporting and the weekly summary

- **SR-901 (SHOULD)** Weekly activity summary, generated on demand and delivered Tuesday mornings, containing exactly: messages received and answered; fastest and average response time; requests opened and completed; proposals sent and approved; trips booked; items Bolanle had to chase manually; AI-noticed repeated client patterns (frequent destinations, hotel brands). [UR-G3]
- **SR-902 (SHOULD)** The summary is the standing agenda artifact for the Tuesday call (UR-H4) and is generated from live data, not hand-compiled. [UR-H4]

### SR-1000: Reliability and failure handling

- **SR-1001 (MUST)** No silent loss anywhere: capture failure, AI failure, CRM failure, webhook failure, and delivery failure each produce a visible state, an alert, and a recoverable task. [30-day 2 item 11; UR-A4]
- **SR-1002 (MUST)** Idempotency across WhatsApp and Chatwoot webhooks and CRM sync (duplicate delivery creates no duplicates). [30-day 6.2; P1-06]
- **SR-1003 (MUST)** Monitoring covers: WhatsApp inbound and outbound failures; unprocessed webhook count and message age; AI latency, error rate, and fallback count; queue and worker health; database pool; certificate expiry. Named alert route to the delivery team. [30-day 7.4]
- **SR-1004 (MUST)** Support path during the pilot: Bolanle reaches the delivery team by WhatsApp or email; response within the same working day. [UR-G5]
- **SR-1005 (MUST)** Backup before migrations; tested restore; recorded rollback command before cutover. [30-day P0-10]

## 6. Non-functional requirements

| ID | Requirement | Source |
|---|---|---|
| NFR-01 | Urgent message is captured, triaged, and draft-visible to Bolanle within 5 minutes end to end (her reply SLA is 15 to 30 minutes; the system must leave most of that window to her) | UR-B5, UR-B4 |
| NFR-02 | Ordinary message triaged and draft-visible within 15 minutes | UR-B5 |
| NFR-03 | Voice transcription completes within the AI processing timeout; on failure the message is never lost (SR-102) | UR-B2 |
| NFR-04 | Conversation and memory search responds in under 3 seconds for pilot data volumes | UR-A3 |
| NFR-05 | Pilot runs for 3 continuous weeks without data loss; weekly restore check in week 1 | UR-A5 |
| NFR-06 | Client-side experience unchanged: zero new steps for clients (the disqualifier test) | UR-A4 |
| NFR-07 | All new UI text is plain, professional, and discreet; nothing client-identifying appears in shared screenshots or logs | UR-E4 |

## 7. Out of scope for the pilot (agreed LATER)

1. Email channel (UR-B1: "email can come later").
2. Client-facing read-only booking view (CR-001, Tuesday discussion; aligns with the co-developer's `TRAVELER_EXPERIENCE_PWA_ARCHITECTURE_2026-08-22.md` blueprint on main).
3. Payments, invoices, Stripe (UR-G1).
4. Multi-advisor workflows, task hand-off, per-advisor views (UR-F2, single-user decision).
5. AI-suggested next action card and opportunity value estimate in the UI (persisted in schema, hidden in pilot UI per UR-C2).
6. Research assistance (hotel, flight, restaurant, experience research automation; links to `SUPPLIER_QUOTE_INGESTION_LLM_IMPLEMENTATION_PLAN_2026-08-22.md` on main).
7. Member self-service portal and autonomous AI auto-reply (parked by the 19 August pivot; remains parked).
8. Native mobile applications; additional channels beyond WhatsApp.

## 8. Data model (pilot delta on main, verified against `schema.ts` on 9 September)

**Already exists, no rebuild (wire and verify only):** `advisor_tasks` (SR-500, SR-501, SR-505), `audit_logs` with audit action enum (SR-804), `morning_briefings` (SR-504), `commission_ledger` with commission status enum (SR-604), `celebrations` (SR-403 proactive dates, SR-504 birthdays), `member_profiles` and `member_family_members` (SR-200 partial), `conversations`, `messages`, `ai_insights`, `travel_requests`, `proposals`, `proposal_items`, `bookings` (SR-600), plus the WhatsApp and Chatwoot event tables from migrations 0004 to 0010.

**New migrations (0011 onward, only after the backup and restore rehearsal per SR-1005):**

1. **client_memory** table: client_id, category (travel_history, preference, family, important_date, past_request, issue, pattern), content, source (message_id, task_id, manual), created_at, review_status. Encrypts via SR-205 where category intersects sensitive fields. Powers SR-201 and P0-13 grounding.
2. **sla_timers** table: request_id, urgency, opened_at, first_response_at, breach_warned_at (SR-502).
3. **proposal_versions** table: proposal_id, version_no, document_ref, status, created_by, created_at (SR-602).

**Extensions to existing tables (verify field presence before adding):** audit_logs gains sensitive-read events (who saw what, including field-level reads on the SR-205 list); advisor_tasks gains trigger-source and promised-date fields for SR-501; the AI triage run carries the full working-sheet schema per SR-301 (persist next-action and opportunity value even though the pilot UI hides them, UR-C2); celebrations link to the proactive template used for each outbound reminder (SR-403).

## 9. Traceability matrix (UR to SR to plan)

| UR / grid row | SRs | 30-day plan anchor |
|---|---|---|
| A1, A4 (success, disqualifiers) | all acceptance criteria in section 10 | section 2 release outcome |
| B1, B3, B6 | SR-101, SR-103, SR-105 | 6.1, 6.2 |
| B2 (voice) | SR-102, NFR-03 | P1-10, Days 10 to 14 |
| B4, B5 (urgency, SLA) | SR-303, SR-502, NFR-01, NFR-02 | 6.3 |
| B7 (proactive) | SR-403 | 6.4 |
| C1 (guarantee) | SR-307, SR-401 | 5.1, 6.4, NO-GO list |
| C2 (working sheet) | SR-301, SR-302 | 6.3, P0-13 |
| C3, A3 (memory, load) | SR-201, SR-202, SR-207, SR-702, SR-703 | 5.1 |
| C4 (grounding) | SR-304 | 5.5 |
| C5 (holding note) | SR-306 | Days 10 to 14 exit |
| D1, D2 | SR-503, SR-701 | 5.1 |
| D3 (tasks) | SR-501 | 6.5 item 6 |
| D4 (briefing) | SR-504 | (new capability, pilot addition) |
| E1, E2 | SR-601, SR-602 | 5.4 |
| E3, E4 | SR-603, SR-404 | 5.4 |
| E5 | SR-605 | 5.4 |
| F1, F4 | SR-204, SR-205 | P0-12 |
| F3 | SR-203 | 5.3 |
| F5, row 15 | SR-804 | 7.3 |
| G1 (no payments) | section 7 item 3 | Days 19 to 22 scope decision |
| G3, H4 (weekly) | SR-901, SR-902 | (new, pilot addition) |
| Grid 13 (2FA) | SR-801 | P1-09 |
| P0-11 (IDOR) | SR-803 | Days 15 to 18 |

## 10. Pilot acceptance test (derived; extends the 30-day 6.5 suite)

Every item is executed with the four pilot client personas (or seeded equivalents) before the pilot starts, and re-run as regression on request:

1. Text message from each persona: captured once, linked, triaged, working sheet shows the four ranked sections, draft editable and sendable; delivery confirmed.
2. Voice note: transcript accurate enough to triage; original audio retrievable; corrupted-audio case produces flagged task (SR-102).
3. Photo and document attachments: persisted, referenced in the conversation and request.
4. Screenshot-type attachment: stored and viewable (UR-B3 other).
5. Unknown number: held for review; no record created until approved; approval is reversible (SR-103).
6. Duplicate webhook replay: zero duplicates (SR-1002).
7. The four urgency seed scenarios classify urgent and page within the SLA window (SR-303, SR-502, NFR-01).
8. SLA breach simulation: indicator change and alert task fire (SR-502).
9. AI outage simulation: holding note one-tap send works with the exact approved wording; follow-up task created (SR-305, SR-306, SR-1001).
10. Chatwoot outage simulation: durable failure, retry on recovery, no loss (SR-1001).
11. Proactive outbound: birthday reminder drafts a business-initiated message; template compliance outside the 24-hour window verified (SR-403).
12. Grounding probe: request with no source data; draft contains no invented price, availability, or booking claim (SR-304).
13. Exclusion probe: attempt to store a payment card number and a family office instruction; rejected at entry; never reaches a prompt (SR-204).
14. Encryption check: sensitive fields are ciphertext at rest (SR-205).
15. Audit check: view a sensitive record, send a message, edit a draft; all three appear in the audit trail with actor and timestamp (SR-804).
16. Duplicate client probe: near-identical record flagged, manual merge works (SR-203).
17. Lifecycle run: message to request, proposal with two versions, approval, booking she confirms, commission field set, post-trip follow-ups including issue flag (SR-601 to SR-605).
18. Morning briefing: contains all five UR-D4 sections including stalled and waiting-on-supplier items (SR-504).
19. Weekly summary: all seven UR-G3 metrics present and correct against the week's data (SR-901).
20. Friction check: a client phone completes the whole journey with zero new steps (NFR-06).
21. Security regression: IDOR probes fail; 2FA enforced; logs contain request IDs but no tokens, PINs, or sensitive content (SR-801, SR-803, SR-806).

## 11. Open decisions and initial change log

| CR | Title | Status | Notes |
|---|---|---|---|
| CR-001 | Read-only client view of bookings (she "would like to discuss": clients seeing their Lanai bookings on a web profile) | OPEN, discuss Tuesday | Aligns with `TRAVELER_EXPERIENCE_PWA_ARCHITECTURE_2026-08-22.md` on main. Default per UR-H2: after pilot. If she wants it sooner, re-scope with a cost in days |
| CR-002 | Pilot data policy: she offered her own details for pilot testing ("we can use my details for pilot if we need to?") | PROPOSED: yes for end-to-end testing with her own contact details; the 4 client personas use seeded synthetic records; no real client data migrated until she decides. Payment card numbers and family office instructions never stored (SR-204) | Confirm with her Tuesday (UR-H3: she decides) |
| CR-003 | Email channel | LATER | UR-B1 |
| CR-004 | Research assistance and supplier quote ingestion | LATER | Links to supplier ingestion blueprint on main; answers UR-A3 research load post-pilot |
| CR-005 | Surface AI next-action and opportunity value in UI | LATER | Persisted in schema already; UR-C2 excluded from pilot UI |
| CR-006 | 30-day plan docs deleted from main | OPEN, ask co-developer | Questionnaire traceability depends on them; preserved on `bionic/deployment-fixes` |

## 12. Change control (agreed, UR-H1 to H4)

1. Every new idea during build or pilot is logged as a CR with number, date, requester, and decision: now, after pilot, or declined.
2. Default decision during the pilot is **after pilot** unless it blocks a MUST item (UR-H2).
3. Ms Bolanle is the single scope decision maker (UR-H3).
4. Weekly review every **Tuesday morning**: progress, change log, and pilot numbers (UR-H4), using the standing update (SR-901/SR-902) and the weekly call.
5. A CR approved as "now" updates this SRS (version bump) and the affected UR record; "after pilot" moves it to the post-pilot backlog with an owner.
