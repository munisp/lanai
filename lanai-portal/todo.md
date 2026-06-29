# Lanai Portal TODO

## Completed
- [x] Live CRM integration (Clients, Travel Requests, Members pages)
- [x] Client-facing portal route (/client) with login, trip view, travel request submission
- [x] Streaming Proposal Co-Pilot (SSE word-by-word output)
- [x] Full-stack upgrade (tRPC + MySQL + Manus OAuth)
- [x] 4 DB tables: members, member_sessions, member_invitations, advisor_users
- [x] Advisor OAuth gate with ProtectedRoute guards
- [x] Member login with bcrypt PIN + signed JWT cookie sessions
- [x] Advisor-initiated invite flow (email → PIN setup → CRM person linkage)
- [x] RBAC middleware: advisor / senior_advisor / admin / member procedures
- [x] Member data isolation: trips scoped to CRM personId
- [x] Tier-gated features: platinum/gold/standard
- [x] CRM proxy moved to Express (port 3000), Twenty CRM on port 3002

## In Progress
- [x] Email delivery for member invitations via Resend API
- [x] Stripe integration: member subscription payments and card-on-file (platinum/gold/silver tiers, card-on-file, billing portal, webhook)
- [x] Promote first advisor to senior_advisor — auto-promoted to admin on first OAuth sign-in via OWNER_OPEN_ID
- [x] Save checkpoint (03274444) and push to GitHub
