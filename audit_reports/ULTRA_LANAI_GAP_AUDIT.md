# Ultra Network → Lanai Feature Gap Audit

**Date:** 29 September 2026
**Reference app:** https://ultranetwork.co/workspace (audited live, advisor account "Bolanle")
**Target app:** https://lanai.newfire.app (audited live, devadmin) · repo `munisp/lanai` · branch `pilot/requirements-baseline-2026-09`
**Purpose:** map Ultra Network's feature set onto Lanai so the pilot build can close the highest-value gaps. Feeds the 30-day pilot plan (`PILOT_SYSTEM_REQUIREMENTS.md`, SR-IDs referenced below).

---

## 1. Platform comparison summary

| Capability | Ultra Network (reference) | Lanai (today) | Gap verdict |
|---|---|---|---|
| Enquiry pipeline | Kanban + card deck + list, stage tabs w/ counts, assignment & reassign, offline-enquiry modal | Travel Requests table, stage filters (SR-700), no kanban/card views, no assignment UI | **GAP — build kanban + assignment (P2 for pilot)** |
| AI trip builder (Merlin equiv.) | Enquiry auto-extract w/ editable chips, 8-day Morning/Afternoon/Evening grid, Merlin chat + voice, client-link issue/revoke, Templates/Descriptions/Documents/Commercial/Experts panels, version history, autosave, hand-off | Proposal Engine (SR-600): streaming + structured proposal from member context + structured request; no day-grid, no client-link sharing | **GAP — add day-grid itinerary + client-link sharing** |
| Client/member records | Clients w/ status, tier, lifetime trips, USD lifetime value | Members w/ tiers (Platinum/Gold/Silver), PIN onboarding (SR-200 client_memory) | Near parity; add lifetime trips/value fields |
| Omnichannel messaging | Unified Inbox w/ per-channel filters (Calls/WhatsApp/SMS/Email/Web Chat), Broadcast, Calls, voicemail | WhatsApp Intelligence (SR-100/300), Chatwoot Inbox, Communication Hub (SR-500) | **Chatwoot not connected on staging — pilot blocker** |
| Supply | 900+ venue catalogue, experience/destination/novelty facets, bookmarks, live supplier API search (HBT/Amadeus) | 8 named suppliers w/ commission rates; Supplier Services catalogue + pricing inquiries | Thin; acceptable for pilot |
| Finance | Commission KPIs (pending/confirmed/paid YTD), payouts, CSV export | Invoicing w/ reconciliation; Revenue Analytics (**404**) | Fix route; commission accrual model differs |
| Admin | Team w/ custom role types + outside specialists; Profile (brand color themes proposals); Settings (enquiry channels, public advisor page w/ slug, sandbox, API keys, membership emblem) | Settings: service status board, WhatsApp setup guide, Chatwoot config | No Team/Profile pages; low priority single-advisor pilot |
| Differentiators (Lanai-only) | — | Morning Briefing (SR-504), NPS & Feedback, Task Templates, CRM Sync (field-ownership conflict resolution), Virtuoso Recommendations, Confirmation Re-brander (**404**), Member Portal (**404** from sidebar) | Keep; these exceed Ultra |

## 2. Lanai bugs found (fix before pilot)

1. **Three dead routes → 404:** Revenue Analytics (`/revenue`), Confirmation Re-brander, Member Portal sidebar link. `/client-intelligence` redirects to `/recommendations` — Client Intelligence has no distinct page.
2. **CRM connection broken on staging:** dashboard shows "CRM error — Workspace not found"; Twenty CRM unreachable; all dashboard KPIs read £0/£0. (Consistent with the 24-Sep Permify/Twenty findings in `PILOT_PROGRESS_LOG.md`.)
3. `/login` returns 404 when already authenticated (cosmetic).

## 3. Ultra bugs observed (parity checks only — not ours to fix)

- Trip builder client-link panel: "We could not load this trip's links."
- Team page: role-types and outside-specialists sections fail to load.
- `/workspace/performance` sidebar link → 404.

## 4. Priority recommendations for the pilot

1. **Connect Chatwoot + Twenty CRM** on lanai.newfire.app (matches 30-day plan WhatsApp-first objective; SR-100/300).
2. **Fix the three 404 routes** (Revenue Analytics, Confirmation Re-brander, Member Portal link).
3. **Add kanban pipeline with assignment** to Travel Requests (Ultra's core daily surface; SR-700).
4. **Add client-link sharing with revocation** for proposals (Ultra's "Issue a link" model; SR-600).

Post-pilot (not in 30-day window): supply catalogue facets & bookmarks, Team/role-types, public advisor page w/ slug, commission auto-accrual.

## 5. Audit method & coverage

- Ultra: every sidebar page opened live (Requests, Clients/Correspondence, Supply, Bookings, Finance, Templates, Learn, Team, Profile, Settings) + trip builder deep flow (enquiry → day grid → Merlin prompt → client-link panel). Buttons and view toggles exercised via the in-app browser.
- Lanai: every sidebar page opened live (Dashboard, Briefing, Clients, Members, Travel Requests, Proposal Engine, Virtuoso Recommendations, Suppliers, Supplier Services, WhatsApp, Chatwoot Inbox, Communication Hub, Task Templates, Invoicing, NPS, CRM Sync, Settings) + route 404 probes.
- Not exercised: Ultra Merlin AI generation end-to-end (response panel not exposed to accessibility tree); Lanai AI proposal generation triggered end-to-end; Ultra separate-session login (magic-link only, audited via logged-in pane instead).
