# Chatwoot Concierge Coverage and Activation Matrix

**Status:** repository-controlled Chatwoot integration is strengthened but not fully activated until a real Chatwoot account, approved inboxes, API token, webhooks, and channel-provider credentials are configured in staging.

## Role in the Lanai architecture

Chatwoot is the **human omnichannel engagement workspace**. Lanai remains the system of record for membership, travel, bookings, finance, authorization, durable AI operations, and audit. Chatwoot must not become a shadow source of truth for customer identity, travel facts, financial records, or provider commitments.

Chatwoot’s official materials describe it as an open-source omnichannel support platform supporting web chat, email, social channels, WhatsApp, Telegram, Line, and SMS; it provides contact profiles, labels, private notes, assignment, teams, rules, macros, campaigns, customer satisfaction reporting, webhooks, APIs, and operational reports.[1][2][3]

## Repository integration controls

| Control | Repository status |
|---|---|
| Server-side API credential custody | Implemented. Browser requests use authenticated allowlisted routes; access tokens remain server-side. |
| Environment and persisted configuration | Implemented. Production requires an HTTPS Chatwoot endpoint; configuration updates and connection tests are administrator-only. |
| Member identity | Implemented. Lanai uses a stable `lanai_member_<id>` contact identifier and member/tier custom attributes. |
| Inbox correctness | Implemented. Contact lookup/create requires configured `defaultInboxId`; the account ID is no longer misused as an inbox ID. |
| Conversation mirror | Strengthened. The mirror now preserves all messages supplied by Chatwoot, obtains true channel type from inboxes, and is idempotent across concurrent writes. |
| Member ownership | Implemented in the member portal; a member may read only conversations linked to their own member record. |
| Advisor workspace | Implemented. Authorized advisors receive the complete synchronized local inbox. Remote assignment is not yet mirrored to `advisorUserId`; this is an explicitly documented configuration/integration gap. |
| AI assistance | Implemented as a draft-only path. AI cannot send a message or promise a booking; an advisor reviews and sends. |
| Inbound webhook synchronization | Not implemented. Current synchronization is an authenticated pull from Chatwoot; production activation requires a dedicated raw-body, timestamped-HMAC, replay-safe Chatwoot webhook receiver. |
| External channel activation | Staging gate. WhatsApp, email, social, SMS, Telegram, and Line require the relevant Chatwoot inbox and channel-provider configuration. |

## Twenty concierge use cases

| # | Concierge use case | Chatwoot capability | Lanai state and required activation |
|---:|---|---|---|
| 1 | WhatsApp service requests | WhatsApp inbox | Requires approved provider inbox and the separate secure provider/Chatwoot inbound path. |
| 2 | Member-portal live chat | Website inbox/widget | Supported; enable the site script only after privacy/cookie review. |
| 3 | Concierge email desk | Email inbox | Supported; configure a dedicated mailbox and retention rules. |
| 4 | Social media enquiries | Instagram, Facebook, and X inboxes | Supported by Chatwoot; configure channel credentials and consent policy. |
| 5 | SMS emergency contact | SMS inbox | Supported by Chatwoot; requires approved messaging provider and regional consent controls. |
| 6 | Single communication timeline | Conversation/message mirror | Implemented locally; full real-time behavior needs the signed Chatwoot webhook receiver. |
| 7 | Member identification | Contacts plus custom attributes | Implemented with immutable Lanai member identifier and tier; additional sensitive profile data stays in Lanai. |
| 8 | VIP routing | Labels, teams, rules, capacity | Configure Chatwoot rules from Lanai-approved tier/priority attributes; do not expose payment or passport data. |
| 9 | Concierge ownership and handoff | Assignment, teams, private notes | Native capability; remote assignee mapping to Lanai advisors remains to be implemented. |
| 10 | Structured request triage | Labels, custom attributes, webhook/API | Lanai AI triage is durable and advisor-reviewed; project intent/urgency into approved Chatwoot labels only after webhook activation. |
| 11 | AI draft responses | API/webhook extension | Implemented draft-only; human approval remains mandatory. |
| 12 | Follow-up reminders | Rules, SLA, macros, API | Configure SLA/rules in Chatwoot and create Lanai tasks through a reviewed webhook worker. |
| 13 | High-touch service templates | Canned responses and macros | Native Chatwoot capability; create version-controlled concierge template library before activation. |
| 14 | Internal supplier/concierge coordination | Private notes and @mentions | Native capability; access remains Chatwoot-role controlled and must not duplicate financial approvals. |
| 15 | Booking/task handoff | Webhooks and APIs | Requires signed webhook receiver that creates idempotent Lanai task requests; no automatic booking commitment. |
| 16 | Preference-aware service | Contact attributes plus Lanai profile lookup | Lanai is authoritative; expose only minimum approved attributes to Chatwoot. |
| 17 | Proactive campaigns | Segments and campaigns | Native capability; outbound consent, audience approval, and marketing governance are required. |
| 18 | Satisfaction/NPS follow-up | CSAT reporting and outbound workflows | Chatwoot can collect conversation CSAT; Lanai NPS remains the program system of record. |
| 19 | Response-time operations | Inbox, agent, team, and SLA reporting | Native capability; schedule secure report ingestion or dashboard link after live API validation. |
| 20 | Audit, continuity, and incident recovery | Webhooks, API, local mirror, durable outbox | Lanai has a durable WhatsApp consumer and operator replay controls; Chatwoot webhook delivery must be added with identical signature/replay guarantees. |

## Staging activation prerequisites

1. Deploy a maintained, supported Chatwoot version with PostgreSQL, Redis, backups, TLS, application secrets, and least-privilege administrator accounts.
2. Configure one approved account, dedicated inboxes, and a default inbound inbox. Store the Lanai API token only in the secret manager.
3. Validate the Lanai server-side connection check and contact synchronization using test members; confirm no token is returned by tRPC or browser proxy APIs.
4. Configure relevant provider channels in test mode, including consent and data-retention policies for each channel.
5. Implement and validate the signed Chatwoot webhook receiver. Chatwoot documents HMAC-SHA256 over `timestamp.raw_body`, timestamp and delivery headers, constant-time comparison, and replay-window validation.[4]
6. Configure rules, labels, teams, agent capacity, business hours, SLA, templates, macros, and campaign permission boundaries in Chatwoot according to the approved concierge operating model.[3]
7. Validate webhook/API delivery, remote assignment, reports, error handling, data minimization, and member/advisor authorization against a real staging instance.

> **Release position:** Chatwoot can support all twenty listed communication-desk capabilities, but several require administrator configuration and the missing signed inbound webhook receiver. The repository must not claim real-time omnichannel synchronization, provider channel availability, SLA, campaigns, or Chatwoot report ingestion until staging evidence exists.

## References

[1]: https://github.com/chatwoot/chatwoot "Chatwoot GitHub repository"
[2]: https://developers.chatwoot.com/introduction "Chatwoot Developer Documentation"
[3]: https://www.chatwoot.com/features/automations "Chatwoot Automations"
[4]: https://www.chatwoot.com/hc/user-guide/articles/1677693021-how-to-use-webhooks "Chatwoot Webhooks and Signature Verification"
