# Lanai Test Tiers

The test suite is deliberately separated by **provider boundary**. This prevents the application from acquiring in-memory, permissive, or credential-bearing production fallbacks merely to satisfy a test fixture.

| Command                       | Scope                                                                         | Required services or credentials                              | Intended trigger                             |
| ----------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------- |
| `pnpm test`                   | Isolated application and in-process provider-contract tests                   | None                                                          | Every local change and pull request          |
| `pnpm test:provider-contract` | CRM proxy, local Stripe SDK fixture, and optional Stripe mock-server contract | None locally; Stripe mock endpoint in CI                      | Every pull request                           |
| `pnpm test:integration`       | PostgreSQL persistence and real Permify authorization smoke suites            | PostgreSQL and Permify                                        | Trusted local and CI runs                    |
| `pnpm test:external`          | Dedicated Twenty test workspace and Stripe sandbox                            | PostgreSQL, Permify, **test-only** CRM and Stripe credentials | Protected `main`, scheduled, and manual runs |
| `pnpm test:all`               | Isolated plus PostgreSQL/Permify integration tests                            | PostgreSQL and Permify                                        | Local pre-merge and internal CI              |

## Local platform integration environment

The compact test topology is checked in as `../docker-compose.test.yml`. It runs only PostgreSQL, real Permify, and a pinned Stripe API-shape fixture; it does **not** start the full production composition.

```bash
cd ..
docker compose -f docker-compose.test.yml up --wait

cd lanai-portal
export DATABASE_URL='postgresql://lanai_test:lanai_test@127.0.0.1:5432/lanai_test'
export PERMIFY_GRPC_ADDRESS='127.0.0.1:3478'
export PERMIFY_TENANT_ID='lanai-test'
export PERMIFY_INSECURE='true'
pnpm test:all

docker compose -f ../docker-compose.test.yml down --volumes --remove-orphans
```

The integration harness automatically applies the checked-in Drizzle migrations, resets the **test-only** database before each smoke case, seeds deterministic platform records, writes the checked-in Permify schema, and creates the minimum authorization tuples required for the asserted policy checks.

> **Never point `DATABASE_URL` at a production or shared development database.** The harness truncates application tables in the configured database.

## Provider-contract coverage

The normal test suite uses an in-process Stripe HTTP fixture to verify request paths, bearer authentication, form serialization, and Checkout request fields. `test:provider-contract` additionally supports a real `stripe-mock` container for trusted CI runs:

```bash
export RUN_STRIPE_MOCK_TESTS='1'
export STRIPE_API_BASE_URL='http://127.0.0.1:12111'
pnpm test:provider-contract
```

`STRIPE_API_BASE_URL` is a test-only endpoint override. It rejects URLs with path components and should never be configured in a production environment.

## Protected external provider tests

`pnpm test:external` validates real provider behavior. The command refuses to run unless all required values are present, and it unsets `STRIPE_API_BASE_URL` to prevent a sandbox test from accidentally using the local contract fixture.

```bash
export DATABASE_URL='postgresql://lanai_test:lanai_test@127.0.0.1:5432/lanai_test'
export PERMIFY_GRPC_ADDRESS='127.0.0.1:3478'
export PERMIFY_TENANT_ID='lanai-test'
export PERMIFY_INSECURE='true'
export TWENTY_CRM_URL='https://<dedicated-test-workspace>'
export TWENTY_CRM_API_TOKEN='<least-privilege-test-key>'
export STRIPE_SECRET_KEY='sk_test_<sandbox-key>'
export STRIPE_PRICE_ID_PLATINUM='price_<sandbox-price>'
export EXTERNAL_TEST_NAMESPACE='lanai-ci'
export EXTERNAL_TEST_RUN_ID="local-$(date +%s)"
pnpm test:external
```

The Stripe suite creates a unique sandbox customer, test payment method, and subscription for each case. It associates all provider objects with the run namespace and deletes the customer and subscription during teardown. The CRM suite uses a dedicated test workspace and verifies authenticated GraphQL connectivity and the workspace schema contract.

The current external suite verifies four real Stripe flows: normalized subscription retrieval, payment-method listing, Checkout session creation, and Billing Portal session creation. The application uses `STRIPE_PRICE_ID_PLATINUM` when configured, which allows CI to use a pre-provisioned sandbox price rather than creating unmanaged product data.

## GitHub Actions configuration

The repository includes two workflows:

| Workflow                                        | Purpose                                                       | Trigger and privilege boundary                                                      |
| ----------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `.github/workflows/internal-tests.yml`          | Isolated, provider-contract, PostgreSQL, and Permify coverage | Pull requests, `main`, and manual runs; no provider secrets                         |
| `.github/workflows/external-provider-tests.yml` | Real Twenty and Stripe sandbox validation                     | `main`, nightly, and manual runs only; protected `external-integration` environment |

To enable the protected external workflow, create the `external-integration` GitHub environment, allow only `main`, require a maintainer approval, and set repository variable `EXTERNAL_INTEGRATION_ENABLED` to `true`. Add the following environment-scoped values:

| Name                            | Type                 | Purpose                                                             |
| ------------------------------- | -------------------- | ------------------------------------------------------------------- |
| `TWENTY_TEST_CRM_URL`           | Secret               | Dedicated Twenty test-workspace URL                                 |
| `TWENTY_TEST_CRM_API_TOKEN`     | Secret               | Least-privilege test-workspace API key                              |
| `STRIPE_TEST_SECRET_KEY`        | Secret               | Stripe **sandbox** secret key; never an `sk_live_` key              |
| `STRIPE_TEST_WEBHOOK_SECRET`    | Secret               | Dedicated test webhook signing secret for future lifecycle coverage |
| `STRIPE_TEST_PRICE_ID_PLATINUM` | Environment variable | Pre-provisioned Stripe sandbox price ID                             |

The external workflow intentionally has no `pull_request_target` trigger and does not make secrets available to fork pull requests. Provider credentials are mapped to application variable names only inside the protected job.

## Expected results

A passing internal run reports the isolated contract tests and the PostgreSQL/Permify smoke suite with no failures. A passing protected external run reports two Twenty CRM checks and four Stripe sandbox checks with no failures. If the external environment is disabled, the protected workflow is skipped rather than silently substituting mocks for real provider behavior.
