# Lanai Pilot Deployment Runbook (2026-09-22, corrected for the real topology)

**Target:** the KIND Kubernetes cluster `newwave-dev` running in Docker on the Minisforum (SSH `newwaveclaw@america`), namespace `lanai`. The lanai.newfire.app web app is NOT a docker container on the host; it is the `lanai-portal` Deployment in that cluster (2 replicas, dapr sidecar). Traffic path: Cloudflare to in-cluster APISIX, ApisixRoute maps `lanai.newfire.app` (plus www/admin/inbox/member) to `lanai-portal:3001`.
**Live image as of 22 Sep:** `registry.digitalocean.com/talentgraph-auth/lanai-portal:kasi-20260725-1441-fix2` (25 July build).
**Deploying:** branch `pilot/requirements-baseline-2026-09` tip (`565c9d2`; code commit `b42cf32`).
**Rule in force:** main/master untouched. Migration 0011 runs only after the backup and restore rehearsal passes (SR-1005 / P0-10).

Kubectl access pattern from the host: `docker exec newwave-dev-control-plane kubectl <args>`.

## Step 0: Recon (read-only)

```bash
ssh newwaveclaw@america 'docker exec newwave-dev-control-plane kubectl -n lanai get pods --no-headers | grep -i postgres; grep -c "registry.digitalocean.com" ~/.docker/config.json 2>/dev/null || echo NO-DO-LOGIN'
```

Security check: note the postgres pod name; note whether the host has DigitalOcean registry credentials (decides push vs kind load).

## Step 1: Backup and restore rehearsal (P0-10 / SR-1005) — GATE

```bash
ssh newwaveclaw@america 'PGPOD=$(docker exec newwave-dev-control-plane kubectl -n lanai get pods --no-headers | grep -i postgres | grep -v exporter | awk "{print \$1}" | head -1); echo $PGPOD; docker exec newwave-dev-control-plane kubectl -n lanai exec $PGPOD -- sh -c "pg_dump -U lanai lanai" > /tmp/lanai_backup_$(date +%Y%m%d_%H%M%S).sql; ls -la /tmp/lanai_backup_*.sql | tail -1'
```

Security check: dump must be non-empty (check size and that it contains CREATE TABLE lines), stored under /tmp on the host with default perms; consider copying to a second location. Never sync off-site without Bolanle-approved encryption.

Restore rehearsal into a scratch database, then compare and drop:

```bash
ssh newwaveclaw@america 'PGPOD=$(docker exec newwave-dev-control-plane kubectl -n lanai get pods --no-headers | grep -i postgres | grep -v exporter | awk "{print \$1}" | head -1); docker exec newwave-dev-control-plane kubectl -n lanai exec $PGPOD -- psql -U lanai -c "DROP DATABASE IF EXISTS lanai_rehearsal" ; docker exec newwave-dev-control-plane kubectl -n lanai exec $PGPOD -- psql -U lanai -c "CREATE DATABASE lanai_rehearsal"; docker exec newwave-dev-control-plane kubectl -n lanai exec $PGPOD -- sh -c "pg_dump -U lanai lanai" | docker exec -i newwave-dev-control-plane kubectl -n lanai exec -i $PGPOD -- psql -U lanai -d lanai_rehearsal >/dev/null; docker exec newwave-dev-control-plane kubectl -n lanai exec $PGPOD -- psql -U lanai -d lanai_rehearsal -tAc "SELECT count(*) FROM members"; docker exec newwave-dev-control-plane kubectl -n lanai exec $PGPOD -- psql -U lanai -d lanai_rehearsal -tAc "SELECT count(*) FROM clients"'
```

Pass criterion: restore completes, row counts match production. Then drop the rehearsal DB.

## Step 2: Build and roll the pilot image

```bash
ssh newwaveclaw@america 'cd /opt/lanai && git fetch origin && git checkout pilot/requirements-baseline-2026-09 && git log --oneline -1'
```

Security check: confirm tip is 565c9d2.

```bash
ssh newwaveclaw@america 'cd /opt/lanai/lanai-portal && docker build -t registry.digitalocean.com/talentgraph-auth/lanai-portal:kasi-20260922-pilot-565c9d2 .'
```

No build args needed (the k8s Dockerfile only defines VITE_APP_ID; runtime env comes from the lanai-env ConfigMap and lanai-secrets).

If the host has DO registry creds: `docker push registry.digitalocean.com/talentgraph-auth/lanai-portal:kasi-20260922-pilot-565c9d2`.
If not: `kind load docker-image registry.digitalocean.com/talentgraph-auth/lanai-portal:kasi-20260922-pilot-565c9d2 --name newwave-dev` and confirm the deployment imagePullPolicy tolerates a locally-loaded image (the July image was pulled from DO, so prefer push).

```bash
ssh newwaveclaw@america 'docker exec newwave-dev-control-plane kubectl -n lanai set image deployment/lanai-portal lanai-portal=registry.digitalocean.com/talentgraph-auth/lanai-portal:kasi-20260922-pilot-565c9d2 && docker exec newwave-dev-control-plane kubectl -n lanai rollout status deployment/lanai-portal --timeout=300s'
```

## Step 3: Live verification (baseline recorded 22 Sep 14:37 UTC)

Before-deploy baseline from the browser: /api/health ok (env production, version 1.0.0); members.list and aiInsights.list return 401 UNAUTHORIZED unauthenticated; clients.list returns 404 (router does not exist in the July build); landing page is the advisor sign-in with a member portal link.

After deploy, from any browser on https://lanai.newfire.app:
- /api/health still ok (fresh timestamp)
- clients.list unauthenticated flips 404 to 401 UNAUTHORIZED — that flip proves the new image is live
- members.list and aiInsights.list still 401 unauthenticated
- Landing page loads; advisor sign-in works for a real account if credentials exist

True IDOR verification (advisor A cannot see advisor B's clients) needs two test advisor accounts; probes alone cannot prove it. Flag as follow-up, do not fake it.

## Step 4: Migration 0011 (ONLY after Step 1 passes)

Simplest path: exec inside the rolled portal pod (it has dist/migrate.js baked in and the full env from the Deployment):

```bash
ssh newwaveclaw@america 'docker exec newwave-dev-control-plane kubectl -n lanai exec deploy/lanai-portal -c lanai-portal -- node dist/migrate.js'
```

Alternative (manifest path): delete and reapply the db-migrate Job from config/k8s/jobs.yaml with the image patched to the new tag. The exec path avoids the Job image placeholder machinery for a one-off.

Verify tables:

```bash
ssh newwaveclaw@america 'PGPOD=$(docker exec newwave-dev-control-plane kubectl -n lanai get pods --no-headers | grep -i postgres | grep -v exporter | awk "{print \$1}" | head -1); docker exec newwave-dev-control-plane kubectl -n lanai exec $PGPOD -- psql -U lanai -d lanai -c "\\dt" | grep -E "client_memory|sla_timers|proposal_versions"'
```

Rollback (schema): restore from the Step 1 backup into the lanai database (document the exact command used in the session log). Rollback (code): `kubectl -n lanai set image deployment/lanai-portal lanai-portal=registry.digitalocean.com/talentgraph-auth/lanai-portal:kasi-20260725-1441-fix2 && rollout status`.