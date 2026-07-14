# Lanai Project Context

## Platform
Luxury concierge CRM (Lanai Lifestyle) - TypeScript/React portal + Python AI pillars.

## Repo
- GitHub: munisp/lanai
- Local: /home/ubuntu/lanai

## Key Files
- Schema: /home/ubuntu/lanai/lanai-portal/drizzle/schema.ts (PostgreSQL, pg-core)
- DB: /home/ubuntu/lanai/lanai-portal/server/db.ts (postgres-js driver)
- Routers: /home/ubuntu/lanai/lanai-portal/server/routers.ts
- Travel Router: /home/ubuntu/lanai/lanai-portal/server/travelRouter.ts
- Infrastructure: /home/ubuntu/lanai/lanai-portal/server/_core/infrastructure.ts
- Smoke Tests: /home/ubuntu/lanai/lanai-portal/server/smoke.test.ts

## Migration Status
- MySQL → PostgreSQL: DONE
- drizzle.config.ts: dialect = "postgresql"
- db.ts: uses postgres-js driver
- schema.ts: uses pg-core (pgTable, serial, pgEnum)
- Tables: users, members, member_invitations, member_sessions, travel_requests, proposals, bookings, suppliers, documents
- Enums: role, tier, travel_request_status, proposal_status, booking_status
- DB pushed to local postgres: DONE

## Service Integrations (all in infrastructure.ts as stubs)
- Keycloak, TigerBeetle, Permify, Dapr, Temporal, Redis, Lakehouse, OpenAppSec, Fluvio, APISIX

## Test Issues Found
1. smoke.test.ts: vi.mock hoisting issue with top-level variables - FIXED
2. crm.secrets.test.ts: fails because TWENTY_CRM_API_TOKEN not set - expected in CI env
3. auth.logout.test.ts: role "user" → "advisor" - FIXED

## Local Postgres
- User: lanai / lanai_password
- DB: lanai
- Port: 5432
