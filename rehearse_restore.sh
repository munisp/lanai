#!/bin/bash
# Backup restore rehearsal for the lanai production database (SR-1005 / P0-10).
# Runs on the Minisforum via: ssh newwaveclaw@america 'bash -s' < rehearse_restore.sh
# Reads /tmp/lanai_backup_20260922.sql, restores it into a scratch database,
# compares row counts, drops the scratch database. Never touches the lanai DB.

set -u
KCTL="docker exec newwave-dev-control-plane kubectl -n lanai exec"
P=postgres-645775b8bb-vhgqp

echo "[1/6] Checking backup file..."
if [ ! -s /tmp/lanai_backup_20260922.sql ]; then
  echo "REHEARSAL FAIL: backup missing or empty"
  exit 1
fi
echo "backup size: $(stat -c %s /tmp/lanai_backup_20260922.sql) bytes"

echo "[2/6] Dropping any old rehearsal database..."
$KCTL $P -- psql -U lanai -c "DROP DATABASE IF EXISTS lanai_rehearsal"

echo "[3/6] Creating scratch database lanai_rehearsal..."
$KCTL $P -- psql -U lanai -c "CREATE DATABASE lanai_rehearsal" || { echo "REHEARSAL FAIL: create db"; exit 1; }

echo "[4/6] Restoring backup into rehearsal database (this may take a moment)..."
docker exec -i newwave-dev-control-plane kubectl -n lanai exec -i $P -- \
  psql -U lanai -d lanai_rehearsal -v ON_ERROR_STOP=0 \
  < /tmp/lanai_backup_20260922.sql > /tmp/rehearsal_restore.log 2>&1
ERRS=$(grep -ci "^psql.*error" /tmp/rehearsal_restore.log)
echo "restore errors: $ERRS"

echo "[5/6] Comparing row counts (rehearsal vs production)..."
for T in members clients conversations messages advisor_tasks; do
  R=$($KCTL $P -- psql -U lanai -d lanai_rehearsal -tAc "SELECT count(*) FROM $T" 2>/dev/null)
  L=$($KCTL $P -- psql -U lanai -d lanai -tAc "SELECT count(*) FROM $T" 2>/dev/null)
  echo "$T: rehearsal=$R production=$L"
done

echo "[6/6] Dropping rehearsal database..."
$KCTL $P -- psql -U lanai -c "DROP DATABASE lanai_rehearsal"

echo "REHEARSAL COMPLETE. Verify the counts above match pairwise, then the gate opens."