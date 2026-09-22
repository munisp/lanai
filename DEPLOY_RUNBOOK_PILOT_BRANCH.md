# Lanai Pilot Branch Deployment Runbook (2026-09-21)

**Target:** lanai-server on the Minisforum (america), SSH `newwaveclaw@america`
**Deploying:** branch `pilot/requirements-baseline-2026-09` at commit `f0c5000` (code commit `b42cf32`)
**Rule in force:** main stays untouched (push-to-branch rule). Migration 0011 does NOT run until the backup and restore rehearsal passes (SR-1005 / P0-10).

Every step has a security check. Do not skip the checks.

---

## Step 0: Recon (read-only)

```bash
ssh newwaveclaw@america 'hostname; cd /opt/lanai && git remote -v && git log --oneline -2 && git status --short | head; docker ps --format "{{.Names}}\t{{.Status}}"; df -h /opt | tail -1'
```

Security check: SSH must be key-based (BatchMode works). Note which containers run on app-net. If disk is under 20 percent free, stop and clear docker build cache before building.

## Step 1: Backup and restore rehearsal (P0-10 / SR-1005) — GATE

```bash
ssh newwaveclaw@america 'PGC=$(docker ps --format "{{.Names}}" | grep -i postgres | head -1); echo $PGC; docker exec $PGC psql -U lanai -d lanai -c "\dt" | head -30'
```

Then dump, restore into a scratch database, and compare:

```bash
ssh newwaveclaw@america 'cd /opt/lanai && PGC=$(docker ps --format "{{.Names}}" | grep -i postgres | head -1) && docker exec $PGC pg_dump -U lanai lanai > backup_pilot_$(date +%Y%m%d_%H%M%S).sql && chmod 600 backup_pilot_*.sql && ls -la backup_pilot_*.sql'
```

Security check: backup file must be mode 600, owned by the SSH user, stored on the host (never synced off-site without Bolanle-approved encryption). Restore rehearsal:

```bash
ssh newwaveclaw@america 'cd /opt/lanai && B=$(ls -t backup_pilot_*.sql | head -1) && PGC=$(docker ps --format "{{.Names}}" | grep -i postgres | head -1) && docker exec $PGC psql -U lanai -c "DROP DATABASE IF EXISTS lanai_rehearsal" && docker exec $PGC psql -U lanai -c "CREATE DATABASE lanai_rehearsal" && docker exec -i $PGC psql -U lanai -d lanai_rehearsal < $B && docker exec $PGC psql -U lanai -d lanai_rehearsal -c "SELECT count(*) FROM members" && docker exec $PGC psql -U lanai -d lanai_rehearsal -c "SELECT count(*) FROM clients"'
```

Pass criterion: restore completes with no fatal errors and row counts match production. THEN drop the rehearsal DB.

## Step 2: Build and deploy the pilot branch

```bash
ssh newwaveclaw@america 'cd /opt/lanai && git fetch origin && git checkout pilot/requirements-baseline-2026-09 && git reset --hard f0c5000 && git log --oneline -1'
```

Security check: confirm `git log` shows f0c5000 exactly; confirm `git diff origin/main --stat` only touches expected files.

```bash
ssh newwaveclaw@america 'cd /opt/lanai/lanai-portal && sudo docker build --build-arg VITE_OAUTH_PORTAL_URL=http://keycloak:8080 --build-arg VITE_APP_ID=lanai-portal --build-arg VITE_FRONTEND_FORGE_API_URL=http://dapr:3500 --build-arg VITE_FRONTEND_FORGE_API_KEY="${BUILT_IN_FORGE_API_KEY:-CHANGE_ME}" -t lanai-server:latest . && sudo docker rm -f lanai-server && sudo docker run -d --name lanai-server --network app-net --restart unless-stopped -p 3001:3001 -v /opt/lanai/lanai-portal/.env:/app/.env:ro --label "com.lanai.version=pilot-f0c5000" --health-cmd="wget --no-verbose --tries=1 --spider http://localhost:3001/ || exit 1" --health-interval=30s --health-timeout=5s --health-retries=3 lanai-server:latest'
```

Note: BUILT_IN_FORGE_API_KEY must come from the host environment as the original redeploy.sh expects; check how the previous build was invoked before substituting. If the previous deployment used CHANGE_ME literally, match it.

Security check after run: `.env` mounted read-only, container only on app-net, only port 3001 published. `sudo docker inspect lanai-server --format "{{.HostConfig.PortBindings}} {{.HostConfig.ReadonlyRootfs}}"`.

## Step 3: Verify live

On host:

```bash
ssh newwaveclaw@america 'sleep 5; sudo docker ps | grep lanai-server; curl -s http://localhost:3001/api/health; echo; curl -s "http://localhost:3001/api/trpc/system.health?input=%7B%7D" | head -c 300'
```

From the Mac, unauthenticated probes (all should return 401/403/4xx, never data):

- https://lanai.newfire.app/api/health
- tRPC members.list, clients.list, aiInsights.list, chatwoot getMessages (no cookie) → expect UNAUTHORIZED
- /manus-storage presign (no cookie) → expect 401
- /crm/graphql (no session) → expect 401

True IDOR verification (advisor A cannot see advisor B's clients) needs two test advisor accounts; flag as follow-up, do not fake it.

## Step 4: Migration 0011 (ONLY after Step 1 passes)

```bash
ssh newwaveclaw@america 'cd /opt/lanai/lanai-portal && sudo docker exec lanai-server node dist/migrate.js'
```

Verify:

```bash
ssh newwaveclaw@america 'PGC=$(docker ps --format "{{.Names}}" | grep -i postgres | head -1) && docker exec $PGC psql -U lanai -d lanai -c "\d client_memory" | head -20 && docker exec $PGC psql -U lanai -d lanai -c "SELECT count(*) FROM client_memory"'
```

Rollback if needed: restore from the Step 1 backup into production (documented in the runbook session log), redeploy previous image tag.

## Rollback (code)

```bash
ssh newwaveclaw@america 'cd /opt/lanai && git checkout main && cd lanai-portal && sudo docker build --build-arg VITE_OAUTH_PORTAL_URL=http://keycloak:8080 --build-arg VITE_APP_ID=lanai-portal --build-arg VITE_FRONTEND_FORGE_API_URL=http://dapr:3500 --build-arg VITE_FRONTEND_FORGE_API_KEY="${BUILT_IN_FORGE_API_KEY:-CHANGE_ME}" -t lanai-server:rollback . && sudo docker rm -f lanai-server && sudo docker run -d --name lanai-server --network app-net --restart unless-stopped -p 3001:3001 -v /opt/lanai/lanai-portal/.env:/app/.env:ro lanai-server:rollback'
```
