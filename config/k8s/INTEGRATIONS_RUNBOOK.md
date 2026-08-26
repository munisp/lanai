# Lanai — Chatwoot + Twenty CRM Deployment Runbook

Deploys self-hosted **Chatwoot** (member messaging / 24-7 concierge) and
**Twenty CRM** (advisor data) into the `lanai` namespace, then wires the
`lanai-portal` app to them so the demo works end-to-end.

Manifests added:
- `config/k8s/integrations-tier.yaml` — Chatwoot + Twenty Deployments/Services/PVCs
- `config/apisix/apisixroute.yaml` — routes for `chatwoot.*` and `crm.*`
- `config/apisix/certificate.yaml` — TLS SANs for the new subdomains
- `config/kustomization.yaml` — includes `integrations-tier.yaml`

Subdomains (demo domain): `chatwoot.lanai.newfire.app`, `crm.lanai.newfire.app`.

> **Before you start**: `chatwoot.lanai.newfire.app` and `crm.lanai.newfire.app`
> must have DNS pointing at the cluster (Cloudflare, managed by your partner).
> The `chatwoot` DB already exists in the shared postgres; the `twenty` DB does
> not and is created in Step 1.

---

## Step 1 — Create the `twenty` database

The `chatwoot` database is already provisioned. Create `twenty` (role + DB).
`CREATE DATABASE` cannot run inside a transaction block, so run each statement
as its own `psql -c` invocation (idempotent via `\gexec`):

```bash
kubectl -n lanai exec -i deployment/postgres -- psql -U lanai -d postgres -c "SELECT 'CREATE ROLE twenty LOGIN PASSWORD ''310e4e2f32d87cd36139f1b52dfa5424''' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname='twenty')\gexec"
kubectl -n lanai exec -i deployment/postgres -- psql -U lanai -d postgres -c "SELECT 'CREATE DATABASE twenty OWNER twenty' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname='twenty')\gexec"
```

## Step 2 — Add the new keys to `lanai-secrets`

```bash
kubectl -n lanai patch secret lanai-secrets --type merge -p '{
  "data": {
    "CHATWOOT_SECRET_KEY_BASE": "ZmJmZjM4YjBjZjZjNjEyYjk3ZWRjZGNmNzgwYjU4MDZmMWUyYTRjYmQwOGRiYmNjZTk3NDU3ZWU5NjU5MDU2Yw==",
    "TWENTY_DB_PASSWORD": "MzEwZTRlMmYzMmQ4N2NkMzYxMzlmMWI1MmRmYTU0MjQ=",
    "TWENTY_APP_SECRET": "M2Y3NTUzMzY1MGFjM2I0M2EwMTI2YzM5ZGFhNzNmZmVlYzY2MWMwMTBkMzdlNDgyYjA2MTM3Y2I0Njk1MTc5YQ==",
    "TWENTY_ACCESS_TOKEN_SECRET": "NmVmMzg2ZDQ3ZTkwYjVkNWIwNTM4MTU2YTI1OThhNWIwOWZiYmNkMGRkNjI4Y2NmZmRhMzFhNDNiYjUwZWViNw==",
    "TWENTY_LOGIN_TOKEN_SECRET": "N2RjOTM5OWFkMmU0YTE5MGYxZjRiZGJiZmEyMjY0OWZiNGVjYzdjYjE5MDlhMWFjODcwYjJkMmQ4ODc1MGNhYw==",
    "TWENTY_REFRESH_TOKEN_SECRET": "MDI4ODhkMmRmODY0MTUzNTdhZjMyMjkzYzMxMWY3ZGM4YjdlOWU1M2JiMGQ2MDAyMGYzZTYzOTJiODZkYTFhYQ=="
  }
}'
```

## Step 3 — Apply the manifests

```bash
cd /Users/oluwajobamalomo/lanai
kubectl apply -f config/k8s/integrations-tier.yaml
kubectl apply -f config/apisix/certificate.yaml
kubectl apply -f config/apisix/apisixroute.yaml
```

## Step 4 — Wait for Chatwoot and Twenty to come up

```bash
kubectl -n lanai rollout status deployment/chatwoot --timeout=300s
kubectl -n lanai rollout status deployment/twenty --timeout=300s
kubectl -n lanai get pods -l 'app in (chatwoot,twenty)'
```

If a pod stays `Pending`, check the PVC/StorageClass:
`kubectl -n lanai get pvc` and `kubectl get storageclass`.

## Step 5 — Set up Chatwoot (one-time, via browser)

1. Open `https://chatwoot.lanai.newfire.app` and create the **super admin**
   account (first signup becomes admin).
2. Create a **website inbox** (Settings → Inboxes → Add inbox → Website).
3. Grab the **account access token**: Settings → Account → Access Token
   (or via `POST /api/v1/auth/sign_in`). This is `CHATWOOT_ACCESS_TOKEN`.
4. Note the account id (usually `1`).

## Step 6 — Set up Twenty (one-time, via browser)

1. Open `https://crm.lanai.newfire.app` and create the workspace/admin account.
2. Generate an **API token** (Settings → API keys / Developers → Create key).
   This is `TWENTY_CRM_API_TOKEN`.

## Step 7 — Point the app at Chatwoot + Twenty, then restart

```bash
kubectl -n lanai patch secret lanai-secrets --type merge -p '{
  "data": {
    "CHATWOOT_URL": "aHR0cDovL2NoYXR3b290OjMwMDA=",
    "CHATWOOT_ACCESS_TOKEN": "<base64 of the token from Step 5>",
    "CHATWOOT_ACCOUNT_ID": "MQ==",
    "TWENTY_CRM_URL": "aHR0cDovL3R3ZW50eTozMDAw",
    "TWENTY_CRM_API_TOKEN": "<base64 of the token from Step 6>"
  }
}'
kubectl -n lanai rollout restart deployment/lanai-portal
kubectl -n lanai rollout status deployment/lanai-portal --timeout=300s
```

> Use `printf '%s' '<token>' | base64` to encode the tokens.

## Step 8 — Verify

```bash
# App is healthy and now sees both integrations
kubectl -n lanai logs deploy/lanai-portal --tail=20

# Chatwoot API responds
kubectl -n lanai exec deploy/lanai-portal -- \
  sh -c 'curl -s http://chatwoot:3000/api/v1/accounts/1/inboxes -H "api_access_token: <TOKEN>"'

# Twenty API responds
kubectl -n lanai exec deploy/lanai-portal -- \
  sh -c 'curl -s http://twenty:3000/healthz'
```

Then in the browser:
- Advisor portal → Clients / Travel Requests should load live data.
- Member portal → "Chat with Lanai Concierge" should send/receive messages.

---

## Notes / caveats

- The `deploy.sh upgrade` path does **not** apply manifests, so use the
  targeted `kubectl apply -f` commands above. Do **not** run `kubectl apply -k config`
  blindly — it regenerates `lanai-secrets` from the (mostly blank) repo
  `.env.secrets` and would blank out the real prod secret.
- Chatwoot/Twenty images are `:latest`. Pin a specific version once you've
  validated a good one.
- These are single-replica, single-container setups (Twenty normally runs
  server + worker; `MESSAGE_QUEUE_TYPE=sync` keeps it in one process for the
  demo). Good enough for a demo, not for production scale.
