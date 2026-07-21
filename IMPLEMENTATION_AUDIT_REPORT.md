# Lanai Platform Implementation Audit and Remediation Report

**Repository:** `munisp/lanai`  
**Audit date:** 2026-07-21  
**Scope:** End-to-end frontend, backend, data model, gateway, identity, eventing, workflow, AI, and deployment implementation review.

## Executive conclusion

The repository was initially a partially wired multi-service platform with material production gaps. The remediation converts the declared stack into a **fail-closed, open-source deployment topology** with persistent PostgreSQL storage, Keycloak-backed authentication, Permify authorization, TigerBeetle financial posting, Dapr service integration, Temporal workflows, Fluvio event publishing, an Iceberg lakehouse ingestion path, APISIX/OpenAppSec request protection, and a local CPU-capable AI gateway.

> **Important runtime boundary:** the source, build, schema, topology, and AI contract validation passed. A live multi-container acceptance run could not be executed in this sandbox because no Docker CLI or daemon is available. The deployment still requires real secrets, a public domain, and reachable external integrations before it can be certified as running in a target environment.

| Area | Audit disposition | Principal outcome |
|---|---|---|
| Core persistence and schema | **Remediated** | PostgreSQL is mandatory at runtime; a replayable Drizzle baseline and integrity migration are present. |
| Identity and authorization | **Remediated** | Keycloak Authorization Code + PKCE, verified sessions, role synchronization, and Permify permission enforcement are implemented. |
| Financial and event delivery | **Remediated** | TigerBeetle ledger posting and PostgreSQL outbox delivery replace logging-only calls and transient side effects. |
| Gateway and edge security | **Remediated** | APISIX routes, supported OpenAppSec attachment topology, and Caddy upstreams reference declared services only. |
| Workflow, mesh, cache, and streaming | **Remediated** | Temporal worker, Dapr sidecars/components, Redis, and Fluvio are included in the deployment and server adapters. |
| Lakehouse | **Remediated** | Nessie, MinIO, Trino, Iceberg catalog configuration, and authenticated ingestion are deployed. |
| AI inference | **Remediated at source level** | Authenticated CPU local-model gateway, strict error paths, model-init container, proxy routes, and contract tests are implemented. |
| Frontend wiring | **Remediated** | Demo responses, browser-only chat, fixed entity IDs, fixed WhatsApp link, and map identifier were removed or replaced with truthful configured states. |
| Runtime end-to-end deployment | **Environment-blocked** | Static topology validation passed; no Docker runtime was available for service startup or live credential checks. |

## Implemented integration matrix

The following matrix maps the requested platform components to the implemented production path. The approach follows each provider’s documented integration model: Keycloak OIDC discovery and certificate endpoints, idempotent TigerBeetle transfer APIs, Dapr sidecars, Permify schema/tuple enforcement, Temporal workers, and APISIX/OpenAppSec attachment deployment. [1] [2] [3] [4] [5] [6] [7]

| Capability | Implemented files and route | Operational behavior |
|---|---|---|
| **Keycloak** | `server/_core/oauth.ts`, `sdk.ts`, `env.ts`, realm configuration, Compose `keycloak` service | Browser login now uses authorization-code + PKCE. Tokens are verified against the configured issuer/JWKS, and server sessions are Redis-backed. |
| **PostgreSQL** | `server/db.ts`, regenerated Drizzle migrations, `config/postgres/00-create-databases.sh` | Runtime persistence fails closed when `DATABASE_URL` is absent. Legacy null-DB and process-local execution branches were removed. |
| **Permify** | `config/permify/schema.perm`, `bootstrapPermify.ts`, `trpc.ts`, `infrastructure.ts` | Schema bootstraps before traffic; Keycloak role synchronization writes relationships; protected tRPC procedures perform a platform permission check. |
| **TigerBeetle** | `server/_core/ledger.ts`, `infrastructure.ts`, Compose `tigerbeetle-init` and `tigerbeetle` | Deterministic account and transfer IDs support idempotent booking commission posting. The replica is formatted before ledger startup. |
| **Redis** | session SDK, infrastructure adapter, Compose `redis`, Dapr Redis component | Advisor sessions and integration state use Redis; no silent in-memory session substitute remains. |
| **Dapr** | `config/dapr/components/redis.yaml`, sidecars, infrastructure adapter | State, pub/sub, and service invocation use authenticated sidecar configuration. |
| **Temporal** | `server/workflows/*`, Compose worker and worker Dapr sidecar | Deterministic workflows and activities are bundled, registered, and executed by a dedicated task-queue worker. |
| **Fluvio** | outbox publisher, infrastructure adapter, Compose stream cluster | Durable domain events publish after database persistence rather than relying on transient application logs. |
| **Lakehouse** | `config/lakehouse/trino/catalog/iceberg.properties`, `lakehouse_ingest/*`, Compose MinIO/Nessie/Trino | Authenticated event ingestion writes through Trino into the self-hosted Iceberg/Nessie/MinIO lakehouse path. [8] |
| **APISIX** | `config/apisix/config.yaml`, `config/apisix/routes/lanai-routes.yaml` | API paths route only to declared portal and AI handlers; unsupported plugins and undeclared gateway consumers were removed. |
| **OpenAppSec** | `config/openappsec/policy.yaml`, Compose agent and APISIX attachment | The composition uses the supported attachment-plus-agent model, with preventive policy and privacy-safe body logging configuration. [7] |
| **CPU AI runtime** | `lanai_ai/gateway/*`, `server/_core/aiRoutes.ts`, Compose Ollama services | The gateway requires an internal bearer token, uses a local CPU model, records inference telemetry, and returns explicit errors rather than fabricated output. |

## Data model, migrations, and indexing remediation

The former single checked-in migration did not match the active schema. It was replaced by a generated baseline, `0000_nervous_doctor_doom.sql`, and a follow-on `0001_platform_integrity.sql` migration. The integrity migration adds missing foreign keys, data checks, and query-oriented compound or partial indexes. The Drizzle journal was rebuilt to make clean database deployment deterministic.

| Data concern | Implementation change |
|---|---|
| Schema/migration mismatch | Rebuilt the Drizzle baseline from the current schema and recorded the migration journal. |
| Referential integrity | Added physical foreign keys for key related entities where the previous schema had logical-only relationships. |
| Invalid state prevention | Added checks for valid monetary, date, and status relationships required by business flows. |
| Query performance | Added compound and partial indexes for frequent tenant, task, audit, messaging, event, and lifecycle query patterns. |
| Event durability | Added persistent event, ledger, workflow, authorization, inference, and lakehouse contracts to the schema. |
| Database availability | Replaced implicit empty-list/null behavior with explicit persistence errors in database access and platform routers. |

## Frontend-to-backend remediation

The page audit found several UI screens that presented fabricated or browser-local outcomes. These were replaced with typed, persisted data paths. In particular, the advisor briefing no longer falls back to a static briefing; the intelligence and proposal pages now consume authenticated AI routes; the WhatsApp workspace uses persisted Chatwoot conversations; and the member dashboard sends and reads real Chatwoot messages.

| User journey | Previous defect | Completed implementation |
|---|---|---|
| Advisor proposal generation | Fabricated output when inference was unavailable | Authenticated AI gateway output only; errors are explicit. |
| Morning briefing | Fixed demo briefing on failed request | Structured local-model response required; no substitute briefing is rendered. |
| Client intelligence | Demo client data and fabricated inference outcomes | Persisted member selector and real AI response contract. |
| Member messages | Browser-memory messages and a fixed WhatsApp number | Member-scoped persisted Chatwoot conversations/messages and remote send mutation. |
| Map rendering | `DEMO_MAP_ID` and hidden service default | Explicit configuration only, with an honest unavailable state when not configured. |
| Member-scoped operational pages | `memberId = 1` defaults | Validated route IDs plus links from the selected member profile. |
| Supplier pricing inquiry | Manually typed supplier/service IDs and fixed member | Persisted supplier, service, and member selections. |
| Task templates | Fixed assignee/member IDs and empty task array | Authenticated advisor assignment, selected member context, and `tasks.myTasks` persistence. |
| Application loading | All route pages included in one oversized asset | React lazy route imports and targeted vendor chunks; the primary application chunk is now approximately 104 KB minified rather than approximately 939 KB. |

## AI implementation status

The platform now has a reproducible **CPU inference path**. Compose starts Ollama without GPU requirements, pulls the configured `OLLAMA_MODEL`, then starts the protected FastAPI gateway only after model initialization. The portal calls this internal gateway through authenticated server routes; frontend clients do not call local model services directly.

The legacy AI pillars were also converted from direct `localhost` calls and fabricated fallback objects to strict shared-client adapters. A model/runtime failure now becomes a real 503-class error instead of a generated-looking answer. The gateway’s contract test verifies token enforcement, successful local completion propagation, and unavailable-runtime handling.

> The repository contains no approved proprietary training corpus, labels, evaluation set, or model-governance policy. Therefore, no claim of a newly fine-tuned proprietary model is made. The implemented model is a **pre-trained CPU-runnable local model** with real inference, inference telemetry, and lakehouse event capture. A training/fine-tuning run must be separately approved after a governed dataset and evaluation protocol are supplied.

## Validation evidence

| Validation | Result | Evidence |
|---|---|---|
| TypeScript check | **Passed** | `pnpm exec tsc --noEmit` completed without errors after final formatting. |
| Production build | **Passed** | `pnpm run build` built client, server, workflows, migration runner, and Permify bootstrap. Page-level chunks were emitted. |
| Drizzle migration consistency | **Passed** | `drizzle-kit check --config=drizzle.config.ts` reported “Everything's fine”. |
| Static topology validation | **Passed** | Custom validation resolved 29 Compose services, all `depends_on` targets, Caddy upstreams, and configuration YAML. |
| CPU AI gateway contracts | **Passed** | 3 tests passed: token required, genuine completion forwarded, runtime failure returns unavailable. |
| Python service syntax | **Passed** | Gateway, legacy strict adapters, CRM connector, WhatsApp bridge, and lakehouse ingestion modules compiled. |
| Production fallback scan | **Passed** | No fixed entity IDs, demo-mode paths, in-memory fallbacks, or functional TODO/FIXME markers were found in the scanned source scope. |
| Docker Compose execution | **Blocked by environment** | Docker CLI/daemon is unavailable in this sandbox. Compose interpolation cannot be executed here. |
| Live external integration acceptance | **Blocked by environment** | Real domains, Keycloak secrets, CRM/Chatwoot/Stripe credentials, and a running container stack are required. |
| Existing legacy smoke tests | **Not a release signal** | 4 legacy test files failed because their fixtures intentionally return `getDb() = null` and expect the removed in-memory runtime paths. The source should be migrated to a PostgreSQL integration harness instead of restoring fallback behavior. |

## Required deployment inputs

The deployment intentionally rejects missing required secrets. At minimum, the target environment must supply `LANAI_DOMAIN`, PostgreSQL and service database passwords, Keycloak portal/admin client credentials, `JWT_SECRET`, `REDIS_PASSWORD`, `DAPR_API_TOKEN`, `AI_GATEWAY_TOKEN`, `LAKEHOUSE_INGEST_TOKEN`, `APISIX_ADMIN_KEY`, MinIO credentials, and Grafana credentials. Optional integrations such as Twenty CRM, Chatwoot, and Stripe are not represented as mock behavior; if their configured features are invoked without credentials, the API responds with an explicit operational error.

The first live deployment must run the Compose stack, wait for migration and Permify bootstrap completion, verify Keycloak realm/client secrets match the configured public domain, and exercise a real user journey through Caddy → APISIX/OpenAppSec → portal → PostgreSQL/Redis/Permify. It must also verify a real CPU inference completion after the model initialization job completes.

## Residual work outside this repository-only audit

The codebase is materially remediated, but three environment-dependent tasks remain: provision non-development secrets and TLS DNS records; launch the 29-service stack in a Docker-capable environment; and replace the old null-database smoke fixtures with a disposable PostgreSQL integration test harness. The final item is test infrastructure debt, not a reason to reintroduce production memory fallbacks.

## References

[1]: https://www.keycloak.org/securing-apps/oidc-layers "Keycloak OIDC layers"
[2]: https://docs.tigerbeetle.com/coding/clients/node/ "TigerBeetle Node client"
[3]: https://docs.dapr.io/operations/hosting/self-hosted/self-hosted-with-docker/ "Dapr self-hosted Docker deployment"
[4]: https://docs.permify.co/getting-started/enforcement "Permify enforcement"
[5]: https://docs.temporal.io/develop/typescript/workers/run-worker-process "Temporal TypeScript worker"
[6]: https://www.fluvio.io/docs/0.16.1/fluvio/installation/docker/ "Fluvio Docker deployment"
[7]: https://apisix.apache.org/blog/2024/10/22/apisix-integrates-with-open-appsec/ "APISIX and OpenAppSec integration"
[8]: https://trino.io/docs/current/connector/iceberg.html "Trino Iceberg connector"
