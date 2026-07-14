# Lanai Platform — Comprehensive Integration Audit Report
**Date:** 2026-07-14  
**Auditor:** Manus AI  

---

## 1. Current State Summary

The Lanai platform consists of:
- **lanai-portal**: TypeScript/React frontend + Express/tRPC backend using MySQL (Drizzle ORM), Stripe, Resend
- **lanai_ai**: Python Flask microservices (Morning Briefing, Intelligence, Proposals, WhatsApp bridge)

---

## 2. Service Integration Audit

| Service | Required | Status | Gap |
|---|---|---|---|
| **Keycloak** | Auth/SSO | ❌ MISSING | No OIDC/OAuth2 integration; custom session-only auth |
| **TigerBeetle** | Financial ledger | ❌ MISSING | No double-entry ledger; commission/billing not tracked |
| **PostgreSQL** | Primary DB | ❌ MISSING | Using MySQL; must migrate to PostgreSQL |
| **APISIX** | API Gateway | ❌ MISSING | No API gateway; direct Express exposure |
| **Permify** | Authorization | ❌ MISSING | Simple role enum only; no fine-grained RBAC/ABAC |
| **Dapr** | Service mesh | ❌ MISSING | No sidecar; no pub/sub; no service invocation |
| **Temporal** | Workflows | ❌ MISSING | No durable workflows; no retry/saga patterns |
| **Redis** | Cache/sessions | ❌ MISSING | No caching layer; sessions in MySQL |
| **Lakehouse** | Analytics | ❌ MISSING | No data lake; no analytics pipeline |
| **OpenAppSec** | WAF/Security | ❌ MISSING | No WAF; no request inspection |
| **Fluvio** | Streaming | ❌ MISSING | No event streaming; no real-time pipeline |

---

## 3. Schema Gaps

### Missing Tables (PostgreSQL)
- `travel_requests` — client travel/lifestyle requests
- `proposals` — advisor-generated proposals with versioning
- `proposal_items` — line items within proposals
- `bookings` — confirmed bookings with supplier links
- `suppliers` — supplier registry with scorecard
- `supplier_contacts` — supplier contact persons
- `commissions` — commission tracking per booking
- `documents` — digital vault documents per member
- `audit_logs` — immutable audit trail
- `notifications` — in-app notification queue
- `whatsapp_messages` — WhatsApp conversation log
- `intelligence_insights` — AI-generated insights
- `morning_briefings` — daily briefing snapshots
- `member_preferences` — client preference profiles
- `events` — outbox/event log for Fluvio streaming
- `workflow_executions` — Temporal workflow tracking
- `ledger_accounts` — TigerBeetle account registry
- `ledger_transfers` — TigerBeetle transfer log
- `api_keys` — APISIX consumer API keys
- `permission_policies` — Permify policy store

### Existing Tables (need migration to PostgreSQL)
- `users` — advisor accounts
- `members` — client portal users
- `member_invitations` — invitation tokens
- `member_sessions` — session tokens (move to Redis)

---

## 4. Workflow Gaps

### Stakeholder: Advisor
- [ ] Create/manage travel requests
- [ ] Generate proposals with AI assistance
- [ ] Track commissions and bookings
- [ ] Send WhatsApp messages to clients
- [ ] View morning briefing
- [ ] Manage supplier relationships
- [ ] View client intelligence insights

### Stakeholder: Senior Advisor / Admin
- [ ] All advisor workflows
- [ ] Manage advisor accounts and roles
- [ ] View platform analytics (Lakehouse)
- [ ] Configure platform settings

### Stakeholder: Member (Client)
- [ ] Onboard via invitation
- [ ] View proposals and approve/reject
- [ ] Submit travel requests
- [ ] Access digital vault documents
- [ ] View trip timeline
- [ ] Manage billing/subscription

### Stakeholder: System (Automated)
- [ ] Morning briefing generation (Temporal)
- [ ] Commission payment reminders (Temporal)
- [ ] WhatsApp AI triage (Fluvio → Dapr → AI)
- [ ] Opportunity detection (Temporal scheduled)
- [ ] Audit log streaming (Fluvio)
- [ ] Cache invalidation (Redis pub/sub)

---

## 5. Security Gaps

- No WAF (OpenAppSec)
- No API rate limiting (APISIX)
- No fine-grained authorization (Permify)
- No SSO/MFA (Keycloak)
- Sessions stored in DB (should be Redis)
- No request signing or API key management

---

## 6. Remediation Plan

All gaps will be addressed in phases 3–7 of this task.
