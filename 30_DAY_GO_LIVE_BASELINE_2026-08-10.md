# Lanai Lifestyle — 30-Day Go-Live Technical Requirements

**Document status:** Go-live planning baseline  
**Plan start:** 10 August 2026  
**Target production date:** 7 September 2026  
**Owner:** Lanai delivery owner  
**Primary release objective:** Put the advisor portal, member portal, CRM, AI assistance, payments, and WhatsApp messaging into a verified, supportable production environment.

---

## 1. Executive decision

### Current release position

**Lanai is not yet ready for a production go-live.** The application is substantially implemented, but the current repository evidence does not demonstrate a complete live deployment. The most important blockers are:

1. WhatsApp/Chatwoot is not deployed and tested as one complete customer-facing path.
2. The Kubernetes manifests reference a WhatsApp bridge Service that is not deployed.
3. Chatwoot is deployed without a separate Sidekiq/worker process, leaving asynchronous processing incomplete.
4. The repository now separates focused tests, provider-contract tests, and a real PostgreSQL/Permify integration harness; those tests still need to be executed successfully against the provisioned environment.
5. The cluster deployment does not verify Chatwoot, Twenty CRM, DNS, TLS, webhooks, or end-to-end customer journeys.
6. Production secrets and credentials require rotation and controlled injection.
7. Several infrastructure services are declared or required by configuration but are not confirmed reachable in the target cluster.
8. Production images are not consistently pinned, and the deployment has no rehearsed rollback or restore procedure.

### Update from latest GitHub state — 10 August 2026

The latest `origin/main` changes improve the implementation baseline and reduce several earlier risks:

- Lanai-to-Twenty CRM synchronization now includes persisted projections, ownership rules, idempotency keys, webhook signature verification, and conflict/sync handling.
- Provider-contract tests now cover CRM proxy behavior, Twenty API behavior, raw webhook signature validation, and Stripe request serialization.
- The portal test commands now separate focused tests from external/provider tests, and `scripts/test-integration.sh` runs the legacy stakeholder journeys against PostgreSQL and Permify rather than the old null-database harness.
- The production build includes the CRM metadata bootstrap bundle and the repository contains additional deployment and integration validation tooling.

These changes are **implementation progress, not production acceptance evidence**. The integration harness still requires a reachable PostgreSQL and Permify environment, and provider-contract tests do not prove that the real Twenty, Chatwoot, Meta, Stripe, Keycloak, or AI services are correctly configured in the target cluster.

### Recommended production architecture decision

For this 30-day release, **Chatwoot should be the single system of record for messaging**, with an official WhatsApp Business/Cloud API channel connected to Chatwoot.

The standalone Python WhatsApp bridge should not be exposed as a second independent messaging path unless it is explicitly deployed, authenticated, persisted, monitored, and tested. At present, the portal UI is Chatwoot-backed, while the Kubernetes gateway references `lanai-whatsapp-bridge` without deploying that Service. Running both paths in parallel would create duplicate messages, inconsistent history, and unclear ownership of outbound replies.

The production message path should be:

```text
Client WhatsApp message
  → Meta WhatsApp Business Cloud API
  → Chatwoot WhatsApp inbox/webhook
  → Chatwoot worker
  → Lanai authenticated Chatwoot integration
  → local persisted conversation mirror
  → AI triage/draft through the AI gateway
  → advisor review and send
  → Chatwoot/Meta outbound delivery
```

The human advisor remains responsible for final client communication. AI may classify, summarise, draft, and prioritise, but must not invent confirmed availability, pricing, bookings, or supplier commitments.

---

## 2. Business release outcome

At the end of the 30 days, Lanai must be able to demonstrate one complete, reliable client journey:

1. A member signs in securely.
2. The member views their trips, profile, documents, proposals, and billing status.
3. The member sends a WhatsApp message.
4. The message arrives in Chatwoot and the Lanai advisor inbox.
5. The platform identifies or creates the correct CRM/member record.
6. The message is persisted once, classified for intent, urgency, and sentiment, and linked to the member.
7. AI produces a draft response grounded in known member facts.
8. An advisor edits and sends the response.
9. The outbound message reaches WhatsApp and appears in the conversation history.
10. A travel request can be created, progressed, proposed, approved, booked, and followed up.
11. Errors produce a visible fallback, an alert, and a recoverable task rather than silent loss.

This is the minimum proof that the platform is not only visually complete, but operationally ready for a premium client.

---

## 3. Current-state gap register

### P0 — must be closed before go-live

| ID | Gap | Evidence | Required outcome |
|---|---|---|---|
| P0-01 | WhatsApp bridge deployment artifact present but not activated | `config/k8s/whatsapp-bridge.yaml` and `config/k8s/whatsapp-consumer.yaml` now exist in `origin/main` but are intentionally not enabled in the root `kustomization.yaml` (draft activation manifest). | Decide whether to enable the bridge manifests or remove the APISIX route. If enabling, perform a secret/egress review, pin the bridge image, and run staging webhook-signature and egress tests before adding to the topology. |
| P0-02 | WhatsApp provider not proven | The standalone bridge contains Meta webhook and send code, but no live provider credentials, phone-number registration, webhook verification, or delivery test is evidenced | Complete provider setup in a non-production Meta business account and prove inbound/outbound delivery. |
| P0-03 | Chatwoot asynchronous processing incomplete | `config/k8s/integrations-tier.yaml` deploys Chatwoot web only; no Sidekiq/worker Deployment is defined | Deploy a version-pinned Chatwoot worker and verify jobs, webhooks, channel delivery, and retries. |
| P0-04 | Chatwoot inbox/channel setup is manual and unverified | `config/k8s/INTEGRATIONS_RUNBOOK.md` requires one-time browser setup | Complete setup, record the inbox/channel IDs securely, and automate or document the repeatable configuration. |
| P0-05 | End-to-end live test not completed | `POST_MERGE_SYSTEM_TEST_REPORT.md` states that the 29-service live stack could not be run | Run the full acceptance suite on the provisioned cluster with non-production credentials, seeded records, and real browser journeys. |
| P0-06 | Integration tests exist but are not yet a completed release gate | Latest `lanai-portal/scripts/test-integration.sh` runs stakeholder suites against PostgreSQL and Permify; provider-contract tests cover CRM/Twenty/Stripe boundaries, but no successful run against the provisioned production-like environment is recorded | Execute focused, provider-contract, and PostgreSQL/Permify integration suites in CI and on the target environment. Replace any remaining obsolete fixture assumptions and publish the reports. |
| P0-07 | Secrets may be compromised or inconsistently managed | Audit identifies credential-shaped values in `lanai-portal/.env` and deployment examples/runbooks contain sensitive-looking values | Rotate all CRM, Chatwoot, Keycloak, JWT, Stripe, webhook, and database credentials. Verify ignore rules and secret-manager injection. |
| P0-08 | Deployment script does not validate integrations | `config/k8s/deploy.sh` waits for selected setup jobs and portal rollout, but not Chatwoot, Twenty, WhatsApp, DNS, TLS, or webhooks | Add a post-deploy release check that fails unless every production-critical dependency and public endpoint passes. |
| P0-09 | Mandatory services are not consistently deployed | Latest CRM synchronization is implemented, but configuration still refers to Temporal, Fluvio, Dapr, APISIX, and lakehouse services while deployment comments identify some as out of scope or absent | Produce one authoritative production topology. Deploy required dependencies or hide/deactivate features that depend on unavailable services, then verify the resulting topology on the cluster. |
| P0-10 | Database backup and rollback are not rehearsed | Deployment documentation has no verified backup/restore or migration rollback exercise | Take a restorable backup, test restore, define migration compatibility, and record rollback commands before production cutover. |

### P1 — must be closed before client pilot

| ID | Gap | Required outcome |
|---|---|---|
| P1-01 | Chatwoot and Twenty use `latest` images | Pin tested versions and preferably immutable digests. |
| P1-02 | Chatwoot/Twenty/portal are single replicas without disruption controls | Define the accepted availability target; add at minimum resource limits, PodDisruptionBudgets where applicable, storage checks, and a recovery runbook. |
| P1-03 | APISIX routes have no confirmed production rate-limit policy | Validate the active gateway and apply limits to auth, public API, AI, and webhook paths without blocking signed webhooks. |
| P1-04 | Public domains and TLS are not proven | Verify DNS, certificates, APISIX routes, portal host, Chatwoot host, CRM host, and API host from outside the cluster. |
| P1-05 | AI readiness is shallow | Verify model pull, gateway readiness, timeout behavior, schema validation, prompt grounding, and fallback behavior under load. |
| P1-06 | Conversation synchronization risks incomplete history | Persist and reconcile every Chatwoot message idempotently; test pagination, duplicate webhooks, edits, attachments, and provider retries. |
| P1-07 | Advisor and member authorization needs production proof | Test that advisors see only permitted data and members cannot access another member's conversations, documents, proposals, or billing records. |
| P1-08 | Operational monitoring is incomplete | Add uptime, error-rate, latency, queue, webhook, AI, database, and storage monitoring with named alert ownership. |
| P1-09 | Client-facing documentation overstates readiness | Update user and deployment manuals to distinguish live, pilot, and roadmap functionality. |

### P2 — can follow the first controlled release

- Multi-replica scaling and autoscaling beyond the agreed pilot capacity.
- Advanced proactive opportunity workflows.
- Full lakehouse analytics and model-training pipelines.
- Full Temporal/Fluvio/Dapr workflow adoption where not required for the first client journey.
- Native mobile applications.
- Additional channels beyond WhatsApp, portal, and email.

P2 items must not be allowed to delay the core release, but they must be tracked so they are not represented as completed features.

---

## 4. Functional technical requirements

### 4.1 Authentication and authorization

**Requirements**

- Advisor authentication must complete through the configured production identity path.
- Member authentication must support invitation, PIN setup, login, session expiry, logout, and PIN recovery.
- Protected API routes must reject unauthenticated requests with `401`.
- A member must never access another member's messages, documents, proposals, invoices, or trips by changing an ID.
- Advisor, senior advisor, admin, and member permissions must be tested against real persisted data.
- Session cookies must be secure, HTTP-only, same-site appropriate, signed, and expire predictably.
- Failed login and recovery paths must be rate-limited and observable.

**Acceptance evidence**

- Browser tests for advisor login, member login, logout, expired session, and unauthorized object access.
- API tests for `401`, `403`, and cross-tenant/object access denial.
- Keycloak/issuer/audience/role validation documented for the actual target environment.

### 4.2 CRM and data integrity

**Requirements**

- Twenty CRM must be reachable from the portal using a server-side token.
- Contact lookup, creation, update, and webhook synchronization must be tested.
- CRM identifiers must be stored alongside Lanai identifiers.
- Duplicate contacts must be prevented or placed into a resolvable conflict queue.
- CRM failure must not silently lose the originating member request or message.
- All core entities must use PostgreSQL persistence with migrations applied to the target database.

**Acceptance evidence**

- Seeded CRM contact is visible in the portal.
- New WhatsApp contact is matched or created once.
- CRM outage test leaves a durable retry task or failed event.
- Migration, foreign-key, index, and backup checks pass.

### 4.3 Travel request, proposal, and booking lifecycle

**Requirements**

- A member can submit a request with destination, dates, travellers, budget, preferences, and special requirements.
- An advisor can assign, update, and progress the request.
- Proposal generation creates a persisted version with status and audit history.
- A member can review and respond to a client-safe proposal.
- Booking confirmation creates a durable booking record and links suppliers, documents, and commissions where applicable.
- Status changes are validated and recorded.
- Internal notes and commercial data must not leak into the member view.

**Acceptance evidence**

- Full seeded lifecycle: new → in progress → proposal sent → approved → booked → completed.
- Browser screenshots or test reports for advisor and member views.
- Rejected, expired, duplicate, and retry cases tested.

### 4.4 Client portal

**Requirements**

- Client dashboard loads real data and intentional empty/loading/error states.
- Trips, proposals, documents, invoices, profile preferences, and messages are linked to the authenticated member.
- Document access uses ownership checks and does not expose arbitrary storage paths.
- Member messages are persisted and visible after refresh or session renewal.
- The portal clearly communicates when an AI response is automated and when advisor follow-up is required.

### 4.5 AI services

**Requirements**

- AI gateway and model readiness must be checked before enabling AI controls.
- Every AI request must have an authenticated caller, request ID, timeout, bounded input, and persisted run status.
- Structured responses must be schema-validated before being shown or persisted.
- AI output must be grounded in supplied facts and must label assumptions.
- AI must not claim confirmed availability, prices, bookings, or supplier commitments without source data.
- AI failure must produce a safe user-facing message and an advisor follow-up task where appropriate.
- AI latency and failure rates must be monitored.

---

## 5. WhatsApp production requirements

WhatsApp is a P0 release area because it is the most visible client communication path and the strongest demonstration of the intelligence layer.

### 5.1 Channel and ownership

- Use one official WhatsApp Business sender for the pilot.
- Connect that sender to the chosen Chatwoot inbox.
- Define whether the advisor replies from Lanai, Chatwoot, or both; the recommended answer is Lanai/Chatwoot through one controlled API path.
- Do not expose provider tokens to the browser.
- Do not operate the un-deployed standalone bridge in parallel with Chatwoot unless the architecture is intentionally changed and fully tested.

### 5.2 Inbound message path

- Meta/Chatwoot webhook must accept only valid signed/provider-authenticated events.
- Webhook processing must acknowledge quickly and process asynchronously.
- Each provider message ID must be idempotent.
- Duplicate webhook delivery must not create duplicate local messages, notes, tasks, or AI runs.
- The message must be linked to a Chatwoot contact and then to a Lanai member/CRM person.
- Unknown contacts must enter a review flow; automatic contact creation must be visible and reversible.
- Message text, type, attachments, timestamp, sender, channel, conversation ID, and provider ID must be persisted.
- The system must preserve the original message before AI processing begins.

### 5.3 AI triage and drafting

For each inbound message, the system should produce:

- Intent/category.
- Urgency.
- Sentiment.
- Short summary.
- Suggested action.
- Suggested tags.
- Draft reply.
- Estimated opportunity value only when supported by the supplied facts.

The draft must be clearly marked as a draft and require advisor review for the pilot. The AI path must have:

- A maximum processing timeout.
- A retry policy with bounded attempts.
- A dead-letter/review state after repeated failure.
- A correlation ID linking provider message, local message, AI run, task, and outbound message.
- Safe fallback acknowledgement where the business has approved the wording.

### 5.4 Outbound messaging

- Advisor can edit the draft before sending.
- Send action must be authenticated and authorized.
- The outbound provider response must be persisted with provider message ID and status.
- Failed delivery must be visible, retryable, and assigned for follow-up.
- WhatsApp template rules must be understood and tested for messages outside the allowed customer-service window.
- Attachments and unsupported message types must have an explicit handling policy.
- The system must not send an AI reply to its own outbound message.

### 5.5 WhatsApp acceptance test

A release candidate passes only when this test succeeds in the target environment:

1. Send a test WhatsApp message from a real pilot number.
2. Confirm provider/Chatwoot webhook receipt.
3. Confirm one local persisted message.
4. Confirm correct contact/member association.
5. Confirm AI triage result and persisted AI run.
6. Confirm advisor task for urgent/new/complaint cases.
7. Confirm draft appears in the advisor UI.
8. Edit and send the response.
9. Confirm outbound delivery on the test phone.
10. Confirm inbound and outbound history after refresh.
11. Repeat the webhook and confirm no duplicates.
12. Stop AI temporarily and confirm safe fallback plus follow-up visibility.
13. Stop Chatwoot temporarily and confirm durable failure/retry behavior.

---

## 6. Deployment and operations requirements

### 6.1 Authoritative topology

Create and maintain one matrix containing, for each service:

- Image and immutable version.
- Namespace.
- Deployment/Job/Service name.
- Port.
- Required secrets.
- Readiness endpoint.
- Liveness endpoint.
- Persistent volume.
- Upstream/downstream dependencies.
- Owner and alert route.
- Whether the service is P0, P1, or P2.

The current repository contains conflicting comments about deployment scope. The authoritative matrix must be generated from the applied Kustomize output and reviewed before release.

### 6.2 Deployment safety

- Pin all production images, including Chatwoot and Twenty.
- Never use `latest` for a production release.
- Capture image digests in the release record.
- Run database backup before migrations.
- Use versioned or safely replaceable setup Jobs.
- Make `deploy.sh` verify all production-critical rollouts, not only portal and selected setup Jobs.
- Add a post-deploy script that checks public HTTPS endpoints and critical internal service contracts.
- Record the previous release tag and rollback command.
- Confirm rollback does not require destructive database rollback.

### 6.3 Security and secrets

- Rotate all credentials found in local environment files or runbooks.
- Use Kubernetes Secrets or an external secret manager; never commit plaintext credentials.
- Separate development, staging, and production credentials.
- Set `NODE_ENV=production` and validate all required values at startup.
- Apply CORS, Helmet, rate limits, request-size limits, and secure cookies.
- Validate webhook signatures before parsing or processing signed payloads.
- Restrict Chatwoot proxy endpoints to the documented allowlist.
- Confirm Chatwoot, CRM, Keycloak, and admin hosts are not publicly exposed beyond the intended route.

### 6.4 Monitoring and support

Minimum production monitoring:

- Portal uptime and `/api/health` readiness.
- HTTP 5xx rate and p95 latency.
- Login failures and rate-limit events.
- Database connection pool and migration status.
- Chatwoot webhook receipt rate.
- WhatsApp inbound/outbound delivery failures.
- Unprocessed webhook count and message age.
- AI latency, error rate, and fallback count.
- Queue/worker health.
- Storage capacity and backup status.
- Certificate expiry and DNS reachability.

A named person must own each alert. A dashboard without an owner is not an operational control.

---

## 7. 30-day delivery plan

### Days 1–2 — Freeze scope and secure the environment

**Tasks**

- Confirm 7 September 2026 as the go-live date.
- Confirm pilot users, pilot members, supported countries, business hours, and WhatsApp sender.
- Decide Chatwoot as the messaging system of record.
- Freeze P0/P1 scope and create a release branch/tag strategy.
- Rotate all credential-shaped secrets and remove local production credentials.
- Confirm target Kubernetes context, namespace, registry, domains, DNS, and TLS ownership.

**Exit criteria**

- Signed scope decision.
- Secret rotation record.
- Named owners for product, infrastructure, WhatsApp, data, and support.
- No unresolved critical security exposure.

### Days 3–5 — Build the authoritative deployment baseline

**Tasks**

- Render and review the complete Kustomize output.
- Reconcile `config/k8s`, `config/apisix`, `DEPLOYMENT.md`, and integration runbooks.
- Remove the orphaned WhatsApp route or add the correct production workload.
- Pin Chatwoot, Twenty, Ollama, portal, and AI gateway images.
- Add Chatwoot worker/Sidekiq deployment and required Redis/job configuration.
- Add resource, storage, readiness, and liveness checks.
- Define backup, restore, rollback, and secret injection procedures.

- Add: Review `config/k8s/whatsapp-bridge.yaml` and `config/k8s/whatsapp-consumer.yaml` drafts now present in `origin/main`; decide whether to enable them in `config/kustomization.yaml` or keep Chatwoot as the single system of record.
- Add: Verify and include the new Drizzle migrations (0007–0009) for WhatsApp/outbox in the DB migration plan and confirm migration rollback steps.

**Exit criteria**

- One approved topology matrix.
- `kubectl apply --dry-run=server` and manifest validation pass.
- Every P0 service has a matching Deployment/Job and Service.
- Images are immutable and recorded.

### Days 6–9 — Provision and verify core platform services

**Tasks**

- Apply database migrations to a disposable target database.
- Verify PostgreSQL connectivity, indexes, foreign keys, and backup/restore.
- Verify Keycloak realm, client, redirect URIs, roles, and login callback.
- Verify Permify schema/bootstrap and authorization checks.
- Verify Twenty CRM workspace, API token, metadata, webhook secret, and seeded records.
- Verify Chatwoot database, web process, worker, Redis connectivity, account, agent, and inbox.
- Verify portal health and server-side integration connectivity.

- Add: Run the new Drizzle WhatsApp/Outbox migrations and verify WhatsApp tables, outbox leases, and consumer leases in the disposable DB.
- Add: Verify CRM sync changes (idempotency keys and webhook signature verification) by exercising webhook delivery against a seeded Twenty workspace.

**Exit criteria**

- Advisor and member login pass in a browser.
- CRM records load from Twenty.
- Chatwoot inbox and worker are healthy.
- Database backup is restored successfully in a disposable namespace/database.

### Days 10–14 — Make WhatsApp production-ready

**Tasks**

- Create/configure the WhatsApp Business/Cloud API sender in the pilot Meta account.
- Connect the sender to the Chatwoot WhatsApp inbox.
- Configure public webhook URL, verification token, signing/secret validation, and TLS.
- Test inbound text messages and provider retries.
- Test contact matching, new-contact review, and CRM association.
- Persist messages and provider IDs idempotently.
- Validate local mirror synchronization and pagination.
- Test AI triage through the AI gateway with timeout and failure handling.
- Add advisor draft, edit, send, and delivery-status tests.
- Test urgent, complaint, unknown contact, attachment, duplicate, and provider-outage cases.
- Add monitoring counters and an operational runbook for failed messages.

- Update: Explicitly run the upstream WhatsApp consumer and bridge tests (`lanai_ai/pillars/whatsapp/test_whatsapp_event_consumer.py`, `lanai_ai/pillars/whatsapp/test_whatsapp_ai_bridge.py`) in a staging disposable namespace. If the bridge is enabled, perform an egress gateway review and signed-webhook hardening evidence collection before activation.

**Exit criteria**

- Full WhatsApp acceptance test in Section 5.5 passes.
- No duplicate local messages after repeated webhook delivery.
- Outbound test message reaches a real pilot phone.
- AI outage and Chatwoot outage produce visible recoverable failures.
- Business owner approves the fallback acknowledgement wording.

### Days 15–18 — Verify every user-facing application route

**Tasks**

- Execute advisor route smoke tests for dashboard, clients, members, requests, proposals, intelligence, briefing, WhatsApp, inbox, suppliers, invoicing, celebrations, NPS, analytics, and settings.
- Execute member route tests for login, dashboard, trips, proposals, documents, billing, profile, and messages.
- Test loading, empty, error, unauthorized, and retry states.
- Test mobile/tablet layouts for the member portal and advisor messaging views.
- Verify no hard-coded demo data is shown when the backend is empty or unavailable.
- Confirm internal notes and commercial fields do not appear in member views.

- Add: Include portal changes introduced upstream (CRM sync, ChatwootInboxPage updates) in the route and inbox UI tests.

**Exit criteria**

- All production routes resolve.
- All critical interactive actions reach real backend paths.
- No P0 frontend error remains in browser console.
- Screenshots/video of the complete demo journey are captured.

### Days 19–21 — Complete business workflow and financial verification

**Tasks**

- Run the full request → proposal → approval → booking → document journey.
- Verify Stripe test-mode checkout and webhook handling if billing is in scope for launch.
- Verify membership tiers, subscription status, invoice status, and cancellation behavior.
- Verify supplier data and commission records where exposed to users.
- Verify celebrations, NPS, tasks, notifications, and analytics with seeded data.
- Confirm email invitations and transactional email sender/domain through Resend.

**Exit criteria**

- Full advisor/member lifecycle passes without manual database edits.
- Payment webhook signatures and failure states pass.
- Email invitation and password/PIN recovery pass.
- Financial and commercial data is access-controlled.

### Days 22–24 — Reliability, security, and performance hardening

**Tasks**

- Run rate-limit, authentication, authorization, input-validation, and webhook-signature tests.
- Run duplicate event and retry tests for WhatsApp, CRM, Stripe, and Chatwoot.
- Perform backup/restore rehearsal and record timings.
- Test pod restart, worker restart, AI restart, database restart, and Chatwoot restart.
- Verify certificates, DNS, ingress, CORS, secure cookies, security headers, and request limits.
- Run a representative pilot load test for concurrent advisors and message traffic.
- Confirm logs contain request IDs but no tokens, PINs, or sensitive message leakage.

**Exit criteria**

- No unresolved critical/high security defect.
- Recovery procedures succeed within the agreed service target.
- Alerting fires for simulated WhatsApp, AI, database, and portal failures.

### Days 25–26 — Replace release-unsafe tests and run the release candidate

**Tasks**

- Replace or quarantine legacy null-database tests with real integration fixtures.
- Run type check, production build, migration consistency, topology validation, server contract smoke, frontend route smoke, and provider contract tests.
- Run Compose/cluster-backed integration tests against seeded services.
- Store test reports and release artifacts.

- Update: Make `scripts/run-staging-release-gates.sh`, provider-contract tests, and `scripts/test-integration.sh` mandatory release-gate steps and require published test reports as part of the exit criteria.

**Exit criteria**

- Required release commands pass.
- No test is marked as passing solely because a provider or database was mocked when the feature is P0.
- Known environmental limitations are documented and accepted by the release owner.

### Days 27–28 — Controlled pilot and client-readiness rehearsal

**Tasks**

- Invite a small internal/pilot group.
- Run the complete client demo using real pilot data.
- Have an advisor process live test messages and requests.
- Collect defects, classify P0/P1/P2, and fix only release-blocking issues.
- Prepare client-facing onboarding, support contacts, privacy wording, and service expectations.
- Confirm that the presentation and user manual describe the actual deployed behavior.

**Exit criteria**

- Pilot users complete their journeys without engineering intervention.
- WhatsApp response and escalation process is understood by the team.
- Client-facing copy does not promise unsupported automation or availability.

### Day 29 — Go/no-go review and cutover rehearsal

**Tasks**

- Freeze code and configuration.
- Take final backup.
- Rehearse deployment, migration, smoke tests, rollback, and restore.
- Review the release checklist with all owners.
- Confirm support rota and incident communication channel.

**Exit criteria**

- Go/no-go checklist signed.
- Rollback command tested.
- Production secrets loaded from the approved source.
- Final release tag and image digests recorded.

### Day 30 — Production release

**Tasks**

- Deploy the approved release.
- Verify all rollouts and Jobs.
- Run public endpoint, authentication, CRM, Chatwoot, AI, WhatsApp, proposal, member portal, and billing smoke tests.
- Send and receive a real controlled WhatsApp test message.
- Monitor continuously during the first operating window.
- Hold a post-release review and publish known limitations.

**Release outcome**

- Platform is live for the approved pilot/customer scope.
- No critical customer journey is dependent on an unverified service.
- Every incoming client message has a visible owner and recoverable state.

---

## 8. Release gate checklist

The release is **GO** only if every P0 item is closed and all statements below are true:

- [ ] Production secrets are rotated, injected securely, and not present in repository history or local deployment artifacts.
- [ ] Target Kubernetes namespace has the complete approved topology.
- [ ] All production images are pinned and release digests recorded.
- [ ] Database migrations and backup/restore are verified.
- [ ] Advisor login and member login work in the public environment.
- [ ] CRM data loads and CRM failure is visible/recoverable.
- [ ] Chatwoot web and worker are healthy.
- [ ] WhatsApp inbound and outbound acceptance test passes.
- [ ] Duplicate WhatsApp webhook delivery is idempotent.
- [ ] AI triage/draft works and fails safely when the model is unavailable.
- [ ] Advisor can edit and send a response.
- [ ] Member can see the conversation after refresh.
- [ ] Travel request → proposal → approval → booking journey passes.
- [ ] Member cannot access another member's data.
- [ ] Payment/email flows are either verified or explicitly removed from the launch scope.
- [ ] Monitoring and alert ownership are active.
- [ ] Rollback and incident procedures are rehearsed.
- [ ] User manual, deployment guide, and client-facing presentation match deployed behavior.

### Automatic NO-GO conditions

- WhatsApp inbound or outbound delivery is unverified.
- Messages can be duplicated, lost, or sent without an audit trail.
- A production secret is exposed or has not been rotated after exposure.
- The public portal is reachable but its database, CRM, or messaging dependencies are not.
- A release relies on `latest` images with no tested rollback.
- Cross-member data access is possible.
- The release owner cannot identify who responds when AI, Chatwoot, or the portal is unavailable.

---

## 9. Required release artifacts

The following artifacts must exist before the deadline:

1. Approved production topology matrix.
2. Environment/secrets inventory with rotation dates, not secret values.
3. Pinned image and release digest list.
4. Database migration and backup/restore record.
5. WhatsApp/Chatwoot channel configuration record.
6. WhatsApp end-to-end test report with message IDs redacted where necessary.
7. Browser smoke-test report for advisor and member journeys.
8. Security and authorization test report.
9. Monitoring dashboard and alert ownership list.
10. Rollback and incident-response runbook.
11. Updated [USER_MANUAL.md](USER_MANUAL.md) and deployment documentation.
12. Client demo script that explains what is live, what is AI-assisted, and what requires advisor confirmation.

---

## 10. Client-confidence message

The client should experience Lanai as a carefully operated premium service, not as a collection of disconnected technical features. The go-live story should be:

> “Lanai brings your travel relationship, requests, proposals, communications, and member experience into one secure environment. The platform uses AI to help the advisory team work faster and with better context, while keeping human judgement at the centre. Every message has a clear route, every request has an owner, and every important client detail is retained for the next interaction.”

The technical work behind this promise is the 30-day release plan: secure infrastructure, verified integrations, reliable WhatsApp delivery, grounded AI, controlled access, and a tested recovery path.

---

## 11. Immediate next actions — next 48 hours

1. Approve the Chatwoot-versus-standalone-bridge architecture decision.
2. Rotate all exposed or credential-shaped secrets.
3. Confirm the target domain and WhatsApp Business sender.
4. Create the production topology matrix and mark every service P0/P1/P2.
5. Provision a non-production WhatsApp/Chatwoot test channel.
6. Add the missing Chatwoot worker deployment.
7. Remove or correct the orphaned `lanai-whatsapp-bridge` APISIX route.
8. Run a real cluster inventory: pods, services, PVCs, jobs, ingress, certificates, and endpoints.
9. Create the first release issue board from the P0/P1 tables in this document.
10. Schedule the Day 29 go/no-go review now.
