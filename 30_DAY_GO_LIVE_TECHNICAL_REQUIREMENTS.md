# Lanai Lifestyle: 30-Day Go-Live Plan (Back-Office Copilot Pivot)

**Document status:** Revised go-live baseline, reflects the client vision pivot of 19 August 2026
**Plan start:** 20 August 2026
**Target production date:** 18 September 2026
**Owner:** Lanai delivery owner
**Pre-pivot baseline:** see `30_DAY_GO_LIVE_BASELINE_2026-08-10.md`

**Primary release objective:** Put the back-office concierge copilot, WhatsApp and voice capture, structured AI triage grounded in client memory, CRM sync, and privacy controls into a verified, supportable production environment. The concierge remains the human interface. No client receives a message the concierge did not review.

## 1. Executive decision

### The pivot

The client's first proper requirements piece reframed the product on 19 August 2026. The design principle is **"digitize the back office, not the relationship."** AI is a **concierge copilot**, not an autonomous client-facing concierge. The concierge remains the primary human interface. The client explicitly does not want an app-driven or self-service process, and does not want autonomous AI replying to clients.

This changes the release shape, not the release engine. The valuable, hard-built back office (CRM sync, AI gateway, client-memory schema, task and booking lifecycle) is exactly what the client wants and stays. The member self-service portal and the dormant autonomous AI auto-reply bridge are parked, because they are the surface the client rejected. Three real gaps remain: voice capture, structured AI triage grounding, and privacy controls.

### Is this a downgrade?

Against the feature count we built, yes, surface area is removed. Against the client's vision, it is an alignment upgrade. Two facts make the cost low: the parked portal was the weakest, most stub-filled part of the live system (empty document vault, stubbed AI draft, broken login on cookie collision), so we are not shedding polished work; and the portal's underlying data and APIs still feed the advisor copilot. "Park" means remove from the client path for this release, not delete. The client said "at least initially," so a client-facing surface can return as a roadmap item once the copilot is proven.

### The automation is preserved, not removed

Your instinct that automation buys the concierge time is correct, and it is fully retained. The AI still captures, summarizes, triages, surfaces client history and preferences, creates tasks and follow-ups, drafts replies, and auto-updates the CRM. All of that gives the concierge more time to interact. The only piece removed is the AI replying to the client unsupervised. That single line is the difference between a copilot and an autonomous concierge, and it is the line the client drew.

## 2. Business release outcome

At the end of the 30 days, Lanai must demonstrate one complete, reliable concierge journey:

1. A client sends a WhatsApp message or voice note.
2. The message is captured and persisted once, before any AI runs.
3. The platform identifies or creates the correct CRM/member record.
4. AI produces structured triage (intent, urgency, sentiment, summary, suggested action, tags) grounded in the client's history and preferences, plus a draft reply.
5. An advisor task is created for urgent, new, or complaint cases.
6. The draft appears in the advisor copilot, clearly marked as a draft.
7. The concierge reviews, edits, and sends the response.
8. The outbound message reaches the client on WhatsApp and appears in history.
9. The CRM is auto-updated with the interaction.
10. A travel request can be created, progressed, proposed, booked, and followed up on the advisor side.
11. Errors produce a visible fallback, an alert, and a recoverable task, never silent loss.
12. No client ever receives a message the concierge did not review.

## 3. What problem this solves, per the client's requirements

Tied to the client's eight core capabilities and design principle:

1. **Shape alignment.** The product now matches "digitize the back office, not the relationship" instead of the over-aggressive "automate the relationship" pitch the build originally followed.
2. **Removes the rejected surface.** Parks the member self-service portal and the autonomous AI auto-reply, both of which the client explicitly does not want.
3. **Focuses effort.** Stops polishing the divergent, buggiest surface and concentrates go-live work on the engine the client wants plus the three real gaps.
4. **Closes release-blocking security.** The cross-member IDORs and PII exposure directly threaten the client's "strong privacy, discretion" core capability and are automatic NO-GO conditions; the pivot makes them the primary hardening work.
5. **Faster verifiable go-live.** The live end-to-end stack has never been run (confirmed in the 21 July post-merge report). Shedding portal polish shortens the path to that first real, tested, end-to-end run.
6. **Preserves time-saving automation.** All back-office automation stays, so the concierge still gets the time savings; only the unsupervised client-facing reply is removed.

## 4. Current-state gap register (revised)

### P0, must close before go-live

- **P0-01**: Orphaned APISIX route `lanai-whatsapp-bridge` points at a non-existent Service. Required outcome: remove the route, or restore the hardened bridge from `origin/main` and enable it. Decide Chatwoot as the single system of record for messaging.
- **P0-02**: WhatsApp provider not proven. Required outcome: complete Meta WhatsApp Business setup in a non-production account and prove inbound and outbound delivery.
- **P0-03**: Chatwoot deployed web-only, no Sidekiq worker. Required outcome: deploy a version-pinned Chatwoot worker and verify jobs, webhooks, channel delivery, and retries.
- **P0-04**: Chatwoot inbox and channel setup is manual and unverified. Required outcome: complete setup, record inbox and channel IDs securely, and document the repeatable configuration.
- **P0-05**: End-to-end live run never completed. Required outcome: run the full concierge acceptance suite on the provisioned cluster with non-production credentials and seeded records.
- **P0-06**: Integration tests not yet a completed release gate. Required outcome: execute focused, provider-contract, and PostgreSQL/Permify integration suites in CI and on the target environment, and publish reports.
- **P0-07**: Secrets compromised and inconsistently managed. Required outcome: rotate all credentials, remove the plaintext Twenty and Chatwoot credentials committed in `config/k8s/INTEGRATIONS_RUNBOOK.md`, and verify SOPS injection and ignore rules.
- **P0-08**: `deploy.sh` does not validate integrations. Required outcome: add a post-deploy release check that fails unless Chatwoot, Twenty, WhatsApp, DNS, TLS, and webhooks all pass.
- **P0-09**: No authoritative topology matrix. Required outcome: produce one matrix from the applied Kustomize output, with image, namespace, port, secrets, readiness, liveness, PV, dependencies, owner, and priority per service.
- **P0-10**: No backup or rollback rehearsal. Required outcome: take a restorable backup, test restore, define migration compatibility, and record rollback commands before cutover.
- **P0-11**: Cross-member data access is possible (release NO-GO). Required outcome: close the `chatwoot.getMessages` IDOR and the `storageProxy` ownership gap, add row-level member isolation to `members.list`, `clients.list`, and `aiInsights.list`, and add a CRM proxy allowlist.
- **P0-12**: PII not encrypted at rest, latent third-party egress. Required outcome: add encryption at rest for passports, DOB, emergency contacts, and family-office contacts, and remove the `forge.manus.im` fallback in `llm.ts`.
- **P0-13**: AI triage returns text-only drafts or a stub. Required outcome: rewire the AI gateway to return structured triage, replace the `chatwootRouter.generateDraftReply` stub with a real gateway call, and ground drafts in client-memory tables.

### P1, must close before client pilot

- **P1-01**: Chatwoot and Twenty use `latest` images. Required outcome: pin tested versions and preferably immutable digests.
- **P1-02**: Single replicas, no disruption controls. Required outcome: define an availability target, and add resource limits, PodDisruptionBudgets, storage checks, and a recovery runbook.
- **P1-03**: APISIX routes have no production rate-limit policy. Required outcome: validate the active gateway and apply limits to auth, public API, AI, and webhook paths without blocking signed webhooks.
- **P1-04**: Public domains and TLS not proven. Required outcome: verify DNS, certificates, APISIX routes, portal host, Chatwoot host, CRM host, and API host from outside the cluster.
- **P1-05**: AI readiness is shallow. Required outcome: verify model pull, gateway readiness, timeout behavior, schema validation, prompt grounding, and fallback under load.
- **P1-06**: Conversation sync risks incomplete history. Required outcome: persist and reconcile every Chatwoot message idempotently, and test pagination, duplicate webhooks, edits, attachments, and provider retries.
- **P1-07**: Advisor authorization needs production proof. Required outcome: test that advisors see only permitted data and members cannot access another member's data.
- **P1-08**: Operational monitoring is incomplete. Required outcome: add uptime, error-rate, latency, queue, webhook, AI, database, and storage monitoring with named alert ownership.
- **P1-09**: Auth hardening incomplete. Required outcome: enforce advisor 2FA (Keycloak TOTP), add member PIN lockout, sign member cookies, and add CSRF and Origin checks.
- **P1-10**: Voice and call capture absent. Required outcome: build speech-to-text ingest of voice notes and calls into the same capture and triage pipeline.

### P2, can follow the first controlled release

- Member self-service portal as a client surface (parked for this release).
- Multi-replica scaling and autoscaling beyond pilot capacity.
- Advanced proactive opportunity workflows (opportunity spotter, anomaly detection, preference inference).
- Full lakehouse analytics and model-training pipelines.
- Full Temporal, Fluvio, Dapr workflow adoption where not required for the first journey.
- Native mobile applications.
- Additional channels beyond WhatsApp, voice, and email.

P2 items must not delay the core release, but must be tracked so they are not represented as completed features.

## 5. Functional requirements

### 5.1 Back-office concierge copilot

- The advisor copilot is the only operating surface for this release. The member self-service portal is parked.
- Every inbound message is captured, persisted once, triaged, and drafted for advisor review.
- AI produces structured triage grounded in client memory: intent, urgency, sentiment, summary, suggested action, suggested tags, and a draft reply.
- The draft is clearly marked as a draft and requires concierge review. No AI reply reaches the client unsupervised.
- The concierge reviews, edits, and sends. The send action is authenticated and authorized.
- The outbound provider response is persisted with provider message ID and delivery status.
- The CRM is auto-updated with the interaction history.

### 5.2 Authentication, authorization, and privacy

- Advisor authentication through the configured production identity path (Keycloak, with 2FA enforced).
- Protected API routes reject unauthenticated requests with 401.
- A member or advisor can never access another member's messages, documents, proposals, invoices, or trips by changing an ID. This is a release NO-GO.
- Advisors see only the member and client data they are permitted to see (row-level isolation, enforced and tested).
- PII is encrypted at rest. No latent egress to any third party. Secrets are rotated and injected via Kubernetes Secrets or an external secret manager.
- Session cookies are secure, HTTP-only, same-site appropriate, signed, and expire predictably.
- Failed login and recovery paths are rate-limited and observable.

### 5.3 CRM and data integrity

- Twenty CRM is reachable from the portal using a server-side token. The CRM proxy has an endpoint allowlist.
- Contact lookup, creation, update, and webhook synchronization are tested.
- CRM identifiers are stored alongside Lanai identifiers.
- Duplicate contacts are prevented or placed into a resolvable conflict queue.
- CRM failure never silently loses the originating member request or message. The `memberPortal.submitRequest` direct-GraphQL bypass is removed; all writes go through the outbox.
- All core entities use PostgreSQL persistence with migrations applied to the target database.

### 5.4 Travel request, proposal, and booking lifecycle

- An advisor can create, assign, and progress a request on a member's behalf (captured from WhatsApp or voice).
- Proposal generation creates a persisted version with status and audit history. Proposal versioning actually increments the version.
- Booking confirmation creates a durable booking record and links suppliers, documents, and commissions.
- Status changes are validated and recorded.
- Internal notes and commercial data never leak into any client-facing view.

### 5.5 AI services

- AI gateway and model readiness are checked before enabling AI controls.
- Every AI request has an authenticated caller, request ID, timeout, bounded input, and persisted run status.
- Structured responses are schema-validated before being shown or persisted.
- AI output is grounded in supplied client facts and labels assumptions.
- AI must not claim confirmed availability, prices, bookings, or supplier commitments without source data.
- AI failure produces a safe user-facing message and an advisor follow-up task.
- AI latency and failure rates are monitored.

## 6. WhatsApp and voice production requirements

WhatsApp and voice are P0 because they are the most visible client communication paths and the strongest demonstration of the intelligence layer.

### 6.1 Channel and ownership

- One official WhatsApp Business sender for the pilot, connected to the Chatwoot inbox.
- Chatwoot is the single system of record for messaging. The standalone Python bridge is not run in parallel unless intentionally deployed, hardened, and tested.
- Voice notes and calls are captured via speech-to-text into the same capture and triage pipeline.
- Provider tokens are never exposed to the browser.

### 6.2 Inbound path

- Meta and Chatwoot webhooks accept only valid signed, provider-authenticated events.
- Webhook processing acknowledges quickly and processes asynchronously (restore the hardened consumer from `origin/main`).
- Each provider message ID is idempotent. Duplicate webhook delivery creates no duplicate local messages, notes, tasks, or AI runs.
- The message is linked to a Chatwoot contact and then to a Lanai member or CRM person.
- Unknown contacts enter a review flow. Automatic contact creation is visible and reversible.
- Message text, type, attachments, timestamp, sender, channel, conversation ID, and provider ID are persisted.
- The original message is preserved before AI processing begins.

### 6.3 AI triage and drafting

For each inbound message, the system produces intent, urgency, sentiment, summary, suggested action, suggested tags, a draft reply, and an estimated opportunity value only when supported by supplied facts. The draft is marked as a draft and requires concierge review for the pilot. The AI path has a maximum processing timeout, a retry policy with bounded attempts, a dead-letter or review state after repeated failure, a correlation ID linking provider message to local message to AI run to task to outbound message, and a safe fallback acknowledgement where the business has approved the wording.

### 6.4 Outbound messaging

- The concierge edits the draft before sending.
- The send action is authenticated and authorized.
- The outbound provider response is persisted with provider message ID and status.
- Failed delivery is visible, retryable, and assigned for follow-up.
- WhatsApp template rules for messages outside the customer-service window are understood and tested.
- Attachments and unsupported types have an explicit handling policy.
- The system never sends an AI reply to its own outbound message.

### 6.5 Acceptance test

A release candidate passes only when this test succeeds in the target environment:

1. Send a test WhatsApp message from a real pilot number. Send a test voice note.
2. Confirm provider and Chatwoot webhook receipt.
3. Confirm one local persisted message per input, before any AI runs.
4. Confirm correct contact and member association.
5. Confirm structured AI triage and a persisted AI run, grounded in client memory.
6. Confirm an advisor task for urgent, new, or complaint cases.
7. Confirm the draft appears in the advisor copilot.
8. Edit and send the response.
9. Confirm outbound delivery on the test phone.
10. Confirm inbound and outbound history after refresh.
11. Repeat the webhook and confirm no duplicates.
12. Stop AI temporarily and confirm safe fallback plus follow-up visibility.
13. Stop Chatwoot temporarily and confirm durable failure and retry behavior.
14. Confirm no outbound message was sent without concierge review.

## 7. Deployment and operations requirements

### 7.1 Authoritative topology

One matrix per service: image and immutable version, namespace, Deployment, Job, and Service name, port, required secrets, readiness endpoint, liveness endpoint, persistent volume, upstream and downstream dependencies, owner and alert route, and P0, P1, or P2. Generated from the applied Kustomize output and reviewed before release.

### 7.2 Deployment safety

- Pin all production images, including Chatwoot and Twenty. Never use `latest` for a production release. Capture image digests in the release record.
- Run a database backup before migrations.
- Make `deploy.sh` verify all production-critical rollouts, not only the portal and selected setup jobs.
- Add a post-deploy script that checks public HTTPS endpoints and critical internal service contracts.
- Record the previous release tag and rollback command. Confirm rollback does not require destructive database rollback.

### 7.3 Security and secrets

- Rotate all credentials found in local environment files or runbooks. Remove the plaintext credentials committed in the integrations runbook.
- Use Kubernetes Secrets or an external secret manager. Never commit plaintext credentials.
- Separate development, staging, and production credentials.
- Set `NODE_ENV=production` and validate all required values at startup.
- Apply CORS, Helmet, rate limits, request-size limits, and secure cookies.
- Validate webhook signatures before parsing or processing signed payloads.
- Restrict the Chatwoot and CRM proxy endpoints to the documented allowlist.
- Encrypt PII at rest. Remove the latent `forge.manus.im` egress.

### 7.4 Monitoring and support

Minimum production monitoring: portal uptime and `/api/health` readiness, HTTP 5xx rate and p95 latency, login failures and rate-limit events, database connection pool and migration status, Chatwoot webhook receipt rate, WhatsApp inbound and outbound delivery failures, unprocessed webhook count and message age, AI latency, error rate, and fallback count, queue and worker health, storage capacity and backup status, and certificate expiry and DNS reachability. A named person owns each alert.

## 8. 30-day delivery plan

### Days 1 to 2, Aug 20 to 21, freeze scope and secure the environment

Tasks:
- Send the client the alignment response (drafted separately). Confirm the back-office copilot scope decision.
- Park the member self-service portal: mark it out of the client path, remove it from the release gate, do not delete the code.
- Remove the dormant Chatwoot auto-reply bridge (`lanai_ai/pillars/chatwoot/app.py`) from any activation path. Remove the orphaned APISIX `lanai-whatsapp-bridge` route.
- Rotate all exposed or credential-shaped secrets. Remove the plaintext Twenty and Chatwoot credentials from `config/k8s/INTEGRATIONS_RUNBOOK.md`.
- Confirm the target Kubernetes context, namespace, registry, domains, DNS, TLS ownership, and WhatsApp Business sender.
- Confirm 18 September 2026 as the go-live date and 7 September is no longer the target.
- Create a release branch and tag strategy.

Exit criteria: signed scope decision, secret rotation record, named owners for product, infrastructure, WhatsApp, data, and support, no unresolved critical security exposure.

### Days 3 to 5, Aug 22 to 24, restore the hardened capture baseline

Tasks:
- Restore the hardened WhatsApp bridge, consumer, tests, and migrations 0007 to 0009 from `origin/main` onto the release branch.
- Reconcile `kustomization.yaml`, `config/apisix`, `DEPLOYMENT.md`, and the integration runbooks. Decide explicitly: Chatwoot as the single system of record, or enable the hardened bridge. Apply that decision in the manifests.
- Add the missing Chatwoot worker and Sidekiq deployment and the required Redis and job configuration.
- Pin Chatwoot, Twenty, Ollama, portal, and AI gateway images. No `latest`.
- Add resource, storage, readiness, and liveness checks.
- Build the authoritative topology matrix (section 7.1).
- Define backup, restore, rollback, and secret injection procedures.

Exit criteria: one approved topology matrix, kubectl server-side dry-run and manifest validation pass, every P0 service has a matching Deployment or Job and Service, images are immutable and recorded.

### Days 6 to 9, Aug 25 to 28, rewire the AI copilot and provision core services

Tasks:
- Rewire the AI gateway to return structured triage (intent, urgency, sentiment, summary, action, tags, draft, estimated value), not text-only drafts.
- Replace the `chatwootRouter.generateDraftReply` stub with a real call to the AI gateway.
- Wire AI triage to ground in the client-memory tables (preferences, family, important dates, travel history, past requests).
- Remove the `memberPortal.submitRequest` direct-GraphQL bypass. Route all member-originating writes through the outbox so CRM failure never loses the request.
- Apply database migrations to a disposable target database. Verify WhatsApp tables, outbox leases, and consumer leases.
- Verify PostgreSQL connectivity, indexes, foreign keys, and backup and restore.
- Verify Keycloak realm, client, redirect URIs, roles, and login callback.
- Verify Permify schema, bootstrap, and authorization checks.
- Verify Twenty CRM workspace, API token, metadata, webhook secret, and seeded records.
- Verify Chatwoot database, web process, worker, Redis connectivity, account, agent, and inbox.
- Verify portal health and server-side integration connectivity.
- Verify CRM sync (idempotency keys and webhook signature verification) by exercising webhook delivery against a seeded Twenty workspace.

Exit criteria: advisor login passes in a browser, CRM records load from Twenty, Chatwoot inbox and worker are healthy, database backup is restored successfully in a disposable namespace.

### Days 10 to 14, Aug 29 to Sep 2, voice capture and WhatsApp production readiness

Tasks:
- Build voice and call capture: speech-to-text ingest of voice notes and calls into the same capture and triage pipeline. Persist the transcript and the original audio reference.
- Create and configure the WhatsApp Business and Cloud API sender in the pilot Meta account. Connect the sender to the Chatwoot WhatsApp inbox.
- Configure the public webhook URL, verification token, signing and secret validation, and TLS.
- Test inbound text messages and provider retries.
- Test contact matching, new-contact review, and CRM association.
- Persist messages and provider IDs idempotently. Validate local mirror synchronization and pagination.
- Test AI triage through the AI gateway with timeout and failure handling, grounded in client memory.
- Add advisor draft, edit, send, and delivery-status tests.
- Test urgent, complaint, unknown contact, attachment, duplicate, and provider-outage cases. Test a voice note end to end.
- Add monitoring counters and an operational runbook for failed messages.
- Run the upstream WhatsApp consumer and bridge tests (`test_whatsapp_event_consumer.py`, `test_whatsapp_ai_bridge.py`) in a staging disposable namespace. Collect signed-webhook hardening evidence before activation.

Exit criteria: full WhatsApp and voice acceptance test in section 6.5 passes, no duplicate local messages after repeated webhook delivery, an outbound test message reaches a real pilot phone, a voice note produces a triaged draft, AI outage and Chatwoot outage produce visible recoverable failures, the business owner approves the fallback acknowledgement wording.

### Days 15 to 18, Sep 3 to 6, privacy, discretion, and access controls

Tasks:
- Close the `chatwoot.getMessages` cross-member IDOR. Add a membership check before returning messages.
- Close the `storageProxy` ownership gap. Verify the requested storage key belongs to the requesting member before presigning a download.
- Add row-level member isolation to `members.list`, `clients.list`, `aiInsights.list`, and the communication hub. Advisors see only permitted data.
- Add a CRM proxy endpoint allowlist so an advisor cannot page the entire Twenty dataset.
- Add encryption at rest for PII: passports, DOB, emergency contacts, family-office contacts, visa expiry, and NDA status.
- Enforce advisor 2FA (Keycloak TOTP as a required action). Add member PIN lockout after repeated failures. Sign member session cookies. Add CSRF and Origin checks. Confirm `SameSite` and `ALLOWED_ORIGINS` are production-safe.
- Remove the `forge.manus.im` fallback in `llm.ts`. Confirm no third-party egress path remains.
- Remove all committed plaintext credentials from the runbook and `.env`. Verify SOPS injection and ignore rules.
- Rotate all CRM, Chatwoot, Keycloak, JWT, Stripe, webhook, and database credentials.

Exit criteria: no cross-member data access is possible (verified by test), PII is encrypted at rest, 2FA is enforced, no latent third-party egress, no plaintext secrets remain in the repo, all credentials rotated.

### Days 19 to 22, Sep 7 to 10, reliability, security verification, and the concierge journey

Tasks:
- Run the end-to-end concierge journey: client WhatsApp or voice, capture, persist, AI triage grounded in memory, advisor copilot, concierge review and edit, send, CRM auto-update, history after refresh.
- Run the full request to proposal to approval to booking to follow-up lifecycle on the advisor side, with no member self-service.
- Verify Stripe test-mode checkout and webhook handling if billing is in scope, or explicitly remove billing from launch scope.
- Verify membership tiers, invoice status, supplier data, commissions, celebrations, NPS, tasks, and notifications with seeded data.
- Confirm email invitations and transactional email sender and domain through Resend.
- Run rate-limit, authentication, authorization, input-validation, and webhook-signature tests.
- Run duplicate-event and retry tests for WhatsApp, CRM, Stripe, and Chatwoot.
- Perform backup and restore rehearsal and record timings.
- Test pod, worker, AI, database, and Chatwoot restarts.
- Verify certificates, DNS, ingress, CORS, secure cookies, security headers, and request limits.
- Run a representative pilot load test for concurrent advisors and message traffic.
- Confirm logs contain request IDs but no tokens, PINs, or sensitive message leakage.

Exit criteria: the concierge journey passes without manual database edits, payment and email flows pass or are explicitly out of scope, no unresolved critical or high security defect, recovery procedures succeed within the agreed service target, alerting fires for simulated WhatsApp, AI, database, and portal failures.

### Days 23 to 25, Sep 11 to 13, replace unsafe tests and run the release candidate

Tasks:
- Replace or quarantine the legacy null-database smoke suites with real Compose-backed integration fixtures.
- Make `scripts/run-staging-release-gates.sh`, the provider-contract tests, and `scripts/test-integration.sh` mandatory release-gate steps. Require published test reports.
- Run type check, production build, migration consistency, topology validation, server contract smoke, frontend route smoke (advisor side only; the member portal is parked), and provider contract tests.
- Run Compose and cluster-backed integration tests against seeded services.
- Store test reports and release artifacts.

Exit criteria: required release commands pass, no test is marked as passing solely because a provider or database was mocked when the feature is P0, known environmental limitations are documented and accepted by the release owner.

### Days 26 to 28, Sep 14 to 16, controlled pilot and client-readiness rehearsal

Tasks:
- Invite a small internal or pilot group of advisors, and a pilot client on WhatsApp only.
- Run the complete concierge demo using real pilot data via WhatsApp. Include a voice note.
- Have an advisor process live test messages and requests. Confirm every AI draft is reviewed before send.
- Collect defects, classify P0, P1, and P2, and fix only release-blocking issues.
- Prepare client-facing onboarding: what is live, what is AI-assisted (copilot), and what requires concierge confirmation.
- Update the user manual and deployment guide to distinguish live, pilot, and roadmap functionality. Remove the "24/7 AI auto-reply" claim. Add the "concierge reviews every reply" guarantee.
- Confirm the presentation and user manual describe the actual deployed behavior.

Exit criteria: pilot users complete their journeys without engineering intervention, the WhatsApp and voice response and escalation process is understood by the team, client-facing copy does not promise unsupported automation or availability.

### Day 29, Sep 17, go or no-go review and cutover rehearsal

Tasks:
- Freeze code and configuration.
- Take the final backup.
- Rehearse deployment, migration, smoke tests, rollback, and restore.
- Review the release checklist with all owners.
- Confirm the support rota and the incident communication channel.

Exit criteria: the go or no-go checklist is signed, the rollback command is tested, production secrets are loaded from the approved source, the final release tag and image digests are recorded.

### Day 30, Sep 18, production release

Tasks:
- Deploy the approved release.
- Verify all rollouts and jobs.
- Run public endpoint, authentication, CRM, Chatwoot, AI, WhatsApp, voice, proposal, and billing smoke tests.
- Send and receive a real controlled WhatsApp test message and a voice note.
- Monitor continuously during the first operating window.
- Hold a post-release review and publish known limitations.

Release outcome: the platform is live for the approved pilot and customer scope, no critical concierge journey depends on an unverified service, every incoming client message has a visible owner and recoverable state, and no client receives a message the concierge did not review.

## 9. Release gate checklist

The release is GO only if every P0 item is closed and all statements below are true:

- [ ] Production secrets are rotated, injected securely, and not present in repository history, local artifacts, or the runbook.
- [ ] The target Kubernetes namespace has the complete approved back-office topology.
- [ ] All production images are pinned and release digests recorded.
- [ ] Database migrations and backup and restore are verified.
- [ ] Advisor login works in the public environment.
- [ ] CRM data loads and CRM failure is visible and recoverable.
- [ ] Chatwoot web and worker are healthy.
- [ ] WhatsApp inbound and outbound acceptance test passes.
- [ ] Voice and call capture produces a triaged request.
- [ ] Duplicate WhatsApp webhook delivery is idempotent.
- [ ] AI triage returns structured output grounded in client memory, not a stub and not text-only.
- [ ] AI fails safely when the model is unavailable, with an advisor follow-up task.
- [ ] The advisor can edit and send a response, and concierge review is mandatory.
- [ ] No outbound message can reach the client without concierge review.
- [ ] The travel request to proposal to booking journey passes on the advisor side.
- [ ] Cross-member data access is impossible (IDORs closed, row-level isolation).
- [ ] PII is encrypted at rest, 2FA is enforced, and no latent third-party egress exists.
- [ ] Payment and email flows are verified or explicitly removed from launch scope.
- [ ] Monitoring and alert ownership are active.
- [ ] Rollback and incident procedures are rehearsed.
- [ ] The user manual, deployment guide, and client-facing presentation match deployed behavior and drop the autonomous AI claim.

Automatic NO-GO conditions:
- WhatsApp inbound or outbound delivery is unverified.
- Any outbound client message can be sent without concierge review (autonomous AI is active).
- Messages can be duplicated, lost, or sent without an audit trail.
- Cross-member data access is possible.
- PII is unencrypted at rest, or a latent third-party egress path exists.
- A production secret is exposed or has not been rotated after exposure.
- The public portal is reachable but its database, CRM, or messaging dependencies are not.
- The release relies on `latest` images with no tested rollback.
- AI returns text-only or stubbed drafts instead of structured triage.

## 10. Required release artifacts

1. Approved production topology matrix.
2. Environment and secrets inventory with rotation dates, not secret values.
3. Pinned image and release digest list.
4. Database migration and backup and restore record.
5. WhatsApp and Chatwoot channel configuration record.
6. WhatsApp and voice end-to-end test report with message IDs redacted where necessary.
7. Browser smoke-test report for the advisor concierge journey.
8. Security and authorization test report, including IDOR and row-level isolation proofs.
9. Monitoring dashboard and alert ownership list.
10. Rollback and incident-response runbook.
11. Updated user manual and deployment documentation that reflect the back-office copilot shape.
12. Client demo script that explains what is live, what is AI-assisted, and what requires concierge confirmation.

## 11. Client-facing message

The client should experience Lanai as a carefully operated premium service, not as a collection of disconnected technical features. The go-live story is:

"Lanai brings your travel relationship, requests, proposals, and communications into one secure back office. The platform uses AI to help your advisory team work faster and with better context, while keeping your concierge at the centre of every client interaction. Every message has a clear route, every request has an owner, and every reply a client receives is reviewed by a person who knows them."

## 12. Immediate next actions, the next 48 hours

1. Send the client the alignment response and confirm the back-office copilot scope decision.
2. Park the member self-service portal and remove it from the release gate.
3. Remove the dormant Chatwoot auto-reply bridge and the orphaned APISIX route.
4. Rotate all exposed secrets and remove the committed plaintext credentials from the runbook.
5. Restore the hardened WhatsApp bridge, consumer, tests, and migrations from `origin/main`.
6. Confirm the target domain and the WhatsApp Business sender.
7. Create the production topology matrix and mark every service P0, P1, or P2.
8. Add the missing Chatwoot worker deployment.
9. Close the two cross-member IDORs (`chatwoot.getMessages`, `storageProxy`).
10. Schedule the Day 29 go or no-go review now.
