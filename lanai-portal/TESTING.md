# Testing Lanai Portal

The test suite is intentionally split into **isolated tests** and **real-service integration smoke tests**. This prevents production code from acquiring in-memory or permissive fallbacks merely to satisfy a test fixture.

| Command                 | Scope                                                                   | Required services      |
| ----------------------- | ----------------------------------------------------------------------- | ---------------------- |
| `pnpm test`             | Isolated unit and contract tests                                        | None                   |
| `pnpm test:integration` | Legacy smoke suites, PostgreSQL persistence, real Permify policy checks | PostgreSQL and Permify |
| `pnpm test:all`         | Both suites in sequence                                                 | PostgreSQL and Permify |

## Integration environment

Set the following environment variables before running `pnpm test:integration` or `pnpm test:all`.

```bash
export DATABASE_URL='postgresql://<test-user>:<test-password>@127.0.0.1:5432/<test-database>'
export PERMIFY_GRPC_ADDRESS='127.0.0.1:3478'
export PERMIFY_TENANT_ID='lanai-test'
export PERMIFY_INSECURE='true'
```

The test harness automatically performs the following actions for every run:

1. It applies the checked-in Drizzle migrations to the supplied **test-only** PostgreSQL database.
2. It truncates application data before each smoke case and inserts deterministic records for the advisor, member, supplier, travel, proposal, booking, invoice, and related lifecycle paths.
3. It writes the checked-in Permify schema and creates only the tuples required for the real authorization assertions.
4. It mocks external side effects that are outside the tested persistence and authorization boundary, including payment, email delivery, event streaming, workflow execution, and TigerBeetle network I/O.

> Do not point these commands at a production database. The integration harness truncates all application tables in the configured database.

## Validation expectations

A successful integration run reports **234 passed** smoke tests and **4 skipped** Stripe tests. The skipped Stripe tests require live provider credentials and remain separately gated by their existing test conditions.

The integration harness is implemented in `server/test/legacySmokeHarness.ts`, while the executable entry point is `scripts/test-integration.sh`.
