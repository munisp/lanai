# Chatwoot Capability Research Notes

Research date: 2026-08-19.

## Official sources reviewed

1. [Chatwoot GitHub repository](https://github.com/chatwoot/chatwoot): describes Chatwoot as an open-source, self-hosted omnichannel customer support platform. It lists supported channels including website live chat, email, Facebook, Instagram, X/Twitter, WhatsApp, Telegram, Line, and SMS. It also lists private notes, labels, canned responses, automatic assignment, custom views/filters, business hours, auto-responders, teams, automation, agent capacity management, contact profiles/segments, campaigns, custom attributes, pre-chat forms, APIs/webhooks, and conversation/agent/inbox/label/team/CSAT reports.
2. [Chatwoot developer introduction](https://developers.chatwoot.com/introduction): documents Docker, Kubernetes, cloud, and VM deployment paths plus Application, Platform, and Client API categories.
3. [Chatwoot webhook guide](https://www.chatwoot.com/hc/user-guide/articles/1677693021-how-to-use-webhooks): documents account-level webhooks and `conversation_created`, `conversation_updated`, `conversation_status_changed`, `message_created`, `message_updated`, and typing events. It documents raw-body HMAC-SHA256 verification over `timestamp.raw_body`, timestamp and delivery headers, constant-time comparison, and an optional stale timestamp rejection.
4. [Chatwoot automations](https://www.chatwoot.com/features/automations): documents rule triggers for conversation/message lifecycle, conditions, conversation routing/assignment/labels/notifications, macros, canned responses, SLA management, and webhook/API extension.
5. [Chatwoot inbox-report API](https://developers.chatwoot.com/api-reference/reports/get-conversation-statistics-grouped-by-inbox): documents per-inbox created/resolved counts and average resolution, first-response, and reply time metrics.

## Integration relevance

Chatwoot can provide the human omnichannel engagement layer for Lanai, while Lanai remains system of record for concierge CRM, financial data, authorization, durable AI orchestration, and platform-wide audit/observability. Any inbound Chatwoot webhook must use raw-body timestamped HMAC verification, replay protection based on delivery/message identity, bounded parsing, and no direct side effects before durable persistence.

## Research boundaries

Feature availability may depend on deployed edition, version, connected channel providers, and administrator configuration. The repository assessment must distinguish capabilities available in Chatwoot from capabilities currently wired into Lanai.
