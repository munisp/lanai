#!/bin/bash
# Inspect the RUNNING July pod's /app layout: ground truth for the runtime
# node_modules question. Read-only exec into the live container.
set -u
K="docker exec newwave-dev-control-plane kubectl -n lanai"
POD=$($K get pods -l app=lanai-portal --field-selector=status.phase=Running --no-headers | head -1 | awk '{print $1}')
echo "inspecting live pod: $POD"
$K exec $POD -c lanai-portal -- sh -c '
echo "--- ls /app ---"; ls -la /app | head -12
echo "--- /app/node_modules top level ---"; ls /app/node_modules 2>/dev/null | head -20
echo "--- drizzle-orm at top level? ---"
[ -e /app/node_modules/drizzle-orm ] && echo "YES" || echo "NO"
echo "--- symlink or real? ---"
[ -L /app/node_modules/drizzle-orm ] && echo "SYMLINK -> $(readlink /app/node_modules/drizzle-orm)" || true
echo "--- .pnpm? ---"
[ -d /app/node_modules/.pnpm ] && echo ".pnpm: $(ls /app/node_modules/.pnpm | wc -l) pkgs" || echo "no .pnpm"
echo "--- lanai-portal dir in image? ---"
[ -d /app/lanai-portal ] && echo "yes" || echo "no"
echo "--- node_modules size ---"
du -sh /app/node_modules 2>/dev/null
'
