# Twenty CRM Token Rotation and Financial Outbox Dead-Letter Runbook

**Scope:** Production operation of the static Twenty CRM bearer token and recovery of financial outbox events whose downstream CRM delivery has failed.

## Security Model

The portal consumes `TWENTY_CRM_URL` and `TWENTY_CRM_API_TOKEN` only from the dedicated Kubernetes Secret `lanai-crm-secrets`. The broad `lanai-secrets` object no longer carries these values. The portal workload remains tokenless for Kubernetes API access; the distinct `lanai-crm-token-rotator` service account is the only repository-declared workload identity that can authenticate to Kubernetes for CRM secret rotation.

Its namespaced Role is restricted to `get`, `patch`, and `update` on the one secret named `lanai-crm-secrets`. It cannot list secrets, read other secret names, create or delete secrets, or restart the portal Deployment. A separate approved release identity must perform the rollout restart after a secret value changes.

## Required Rotation Preconditions

| Precondition | Required state |
|---|---|
| Token source | New Twenty service token approved for the target workspace with the minimum CRM API permissions required by Lanai projections. |
| Secret isolation | `lanai-crm-secrets` exists in the `lanai` namespace and contains only `TWENTY_CRM_URL` and `TWENTY_CRM_API_TOKEN`. |
| Rotation RBAC | `lanai-crm-token-rotator` ServiceAccount, Role, and RoleBinding from `config/k8s/crm-token-rotation-rbac.yaml` are applied. |
| Rotation identity | The rotation controller or operator can patch only `secrets/lanai-crm-secrets`; a separate approved deployment identity can restart `deployment/lanai-portal`. |
| Evidence window | Current financial CRM failures, dead-letter counts, and destination health are recorded before rotation. |

## Rotation Procedure

1. Obtain the replacement service token through the Twenty administrative process. Do not place it in source control, command history, ticket comments, or logs.
2. Create a protected local `.env.crm.secrets` from `.env.crm.secrets.example`, set only the target environment values, and apply the secret with an approved secret-management controller or a controlled Kubernetes secret update.
3. Validate the rotation identity has only the expected permission:

   ```bash
   kubectl auth can-i patch secrets/lanai-crm-secrets \
     --as=system:serviceaccount:lanai:lanai-crm-token-rotator -n lanai
   kubectl auth can-i list secrets \
     --as=system:serviceaccount:lanai:lanai-crm-token-rotator -n lanai
   ```

   The first command must return `yes`; the second must return `no`.
4. Use a separately approved deployment identity to perform `kubectl rollout restart deployment/lanai-portal -n lanai`, then wait for readiness. Secret environment variables are read at process start and do not refresh in running pods.
5. Run the protected Twenty external-provider check using the target workspace. Confirm that CRM deliveries return to `synced`/delivered state.
6. Review `lanai_financial_outbox_events{status="dead_letter"}` and CRM delivery records. Manually resynchronize affected CRM links through the admin CRM sync route after confirming the credential and remote workspace are healthy.
7. Revoke the prior token only after the new token, rollout, external validation, and affected delivery recovery all succeed.

## Dead-Letter Monitoring and Recovery

The portal exposes the Prometheus gauge `lanai_financial_outbox_events{status="..."}`. `config/monitoring/financial-outbox-alerts.yml` defines a critical alert whenever the financial `dead_letter` value remains above zero for one minute.

Prometheus evaluates the rule, but the Alertmanager receiver and escalation destination are deployment-owned. Operators must configure a production Alertmanager receiver and retain alert evidence; an empty receiver list is not notification delivery.

For persistent CRM failures, the outbox dispatcher records per-target errors, retries due rows with capped exponential delay, and dead-letters a row after ten claims. The generic dispatcher does not automatically replay dead letters. For CRM projections, an administrator can inspect failed/dead-letter records and run `crmSync.resyncLink` or `crmSync.reconcileLink` after the remote credential is repaired. Financial ledger transfers remain posted and are never reversed merely because CRM delivery is unavailable.

## Alert Response

| Severity | Trigger | Required response |
|---|---|---|
| Critical | Any `lanai_financial_outbox_events{status="dead_letter"} > 0` for one minute | Acknowledge, identify the event and target, repair provider or credential, validate service health, replay/resynchronize through approved admin controls, and attach reconciliation evidence. |
| Warning | Repeated `failed` delivery records before dead letter | Investigate provider availability, token expiry, rate limits, and network policy before the tenth claim. |
| Security incident | Unexpected CRM `401` or token compromise indication | Suspend CRM sync if required, rotate through this runbook, review delivery audit logs, and revoke the prior token after verification. |
