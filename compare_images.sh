#!/bin/bash
# Read-only comparison of the working July image vs our new pilot image.
# Inspects node_modules layout, npmrc, dist imports, and drizzle folder.
# Both containers run with sh only; nothing is started, nothing written.
set -u
JULY=registry.digitalocean.com/talentgraph-auth/lanai-portal:kasi-20260725-1441-fix2
NEW=registry.digitalocean.com/talentgraph-auth/lanai-portal:kasi-20260922-pilot-565c9d2

probe() {
  local NAME=$1; local IMG=$2
  echo "===== $NAME ($IMG) ====="
  docker run --rm --entrypoint sh "$IMG" -c '
    echo "--- ls /app ---"; ls -la /app | head -12
    echo "--- /app/node_modules top level (first 15) ---"; ls /app/node_modules 2>/dev/null | head -15
    echo "--- is drizzle-orm resolvable at top level? ---"
    if [ -e /app/node_modules/drizzle-orm ]; then echo "YES: /app/node_modules/drizzle-orm exists"; ls -ld /app/node_modules/drizzle-orm; else echo "NO top-level drizzle-orm"; fi
    echo "--- is it a real dir or symlink? ---"
    [ -L /app/node_modules/drizzle-orm ] && echo "SYMLINK" || echo "REAL DIR (hoisted)"
    echo "--- .pnpm store present? ---"
    [ -d /app/node_modules/.pnpm ] && echo ".pnpm present: $(ls /app/node_modules/.pnpm | wc -l) pkgs" || echo "no .pnpm"
    echo "--- package-local node_modules? ---"
    [ -d /app/lanai-portal/node_modules ] && echo "lanai-portal/node_modules EXISTS" || echo "no lanai-portal/node_modules"
    echo "--- .npmrc files in image ---"
    for f in /app/.npmrc /root/.npmrc /app/lanai-portal/.npmrc; do [ -f $f ] && echo "$f:" && cat $f; done
    echo "--- first imports of dist/index.js ---"
    head -c 400 /app/dist/index.js 2>/dev/null
    echo
    echo "--- drizzle folder + migrate entry ---"
    ls /app/drizzle 2>/dev/null | head -5
    grep -o "migrationsFolder[^,)]*" /app/dist/migrate.js 2>/dev/null | head -2
  '
}

probe JULY-WORKING "$JULY"
probe NEW-PILOT "$NEW"
echo "===== done ====="
