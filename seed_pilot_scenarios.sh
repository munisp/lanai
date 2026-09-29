#!/bin/bash
# Seed the four SR-303 urgency scenarios for the demo (Tue 29 Sep).
# Run on the host:  ssh newwaveclaw@america 'bash -s' < seed_pilot_scenarios.sh
#
# Synthetic demo data (SR-303), not real client data. Inserts 4 conversations
# + messages with fixed ids conv_9960xx / msg_9960xx for eleanor.vance@example.com.
# Triage does not run on a direct insert; after seeding, use "Regenerate triage"
# in the Triage Inbox for each entry.
#
# NOTE: this script deliberately contains NO heredocs. Heredocs inside a
# `bash -s` script piped over SSH read from the same stdin as the script
# itself and get misaligned (psql then receives empty input and the INSERTs
# silently no-op). SQL is written to a host temp file and piped into psql.

set -u
K="docker exec newwave-dev-control-plane kubectl -n lanai"
# docker exec MUST carry -i or stdin (the SQL file) never reaches psql and
# every insert silently no-ops with exit 0. SQL travels by stdin: docker
# exec -i -> kubectl exec -i -> psql.
PSQL="docker exec -i newwave-dev-control-plane kubectl -n lanai exec -i deploy/postgres -- psql -U lanai -d lanai -v ON_ERROR_STOP=1"
SQLFILE=/tmp/seed_sr303.sql

echo "=== seeding SR-303 scenarios (eleanor.vance@example.com) ==="

seed_one() {
  local sid="$1"
  local msg="$2"
  : > "$SQLFILE"
  echo "INSERT INTO chatwoot_conversations" >> "$SQLFILE"
  echo "  (\"chatwootId\", \"memberId\", \"contactIdentifier\", \"contactName\", channel, status, \"lastMessage\", \"advisorResponded\", \"memberSeen\", \"updatedAt\")" >> "$SQLFILE"
  echo "SELECT 'conv_${sid}', m.id, '+1555000${sid}', 'Eleanor Vance', 'whatsapp', 'open', '${msg}', false, true, now()" >> "$SQLFILE"
  echo "FROM members m WHERE m.email = 'eleanor.vance@example.com'" >> "$SQLFILE"
  echo "ON CONFLICT (\"chatwootId\") DO UPDATE SET \"lastMessage\" = EXCLUDED.\"lastMessage\", \"updatedAt\" = now();" >> "$SQLFILE"
  echo "INSERT INTO chatwoot_messages" >> "$SQLFILE"
  echo "  (\"chatwootId\", \"conversationId\", \"messageType\", content, \"transcriptionStatus\")" >> "$SQLFILE"
  echo "SELECT 'msg_${sid}', c.id, 'inbound', '${msg}', 'none'" >> "$SQLFILE"
  echo "FROM chatwoot_conversations c WHERE c.\"chatwootId\" = 'conv_${sid}'" >> "$SQLFILE"
  echo "ON CONFLICT (\"chatwootId\") DO UPDATE SET content = EXCLUDED.content;" >> "$SQLFILE"
  $PSQL < "$SQLFILE" || { echo "FAILED scenario ${sid}"; exit 1; }
  echo "seeded scenario ${sid}"
}

seed_one 996001 "My flight home was cancelled and the hotel says they cannot find my reservation either."
seed_one 996002 "Can you book us a table for four tonight? Something special."
seed_one 996003 "Any last-minute tickets for the gala this weekend?"
seed_one 996004 "The hotel cannot find our group booking and check-in is in two hours."

rm -f "$SQLFILE"

echo "=== verifying seeded rows ==="
$K exec deploy/postgres -- psql -U lanai -d lanai -c "SELECT \"chatwootId\", \"lastMessage\" FROM chatwoot_conversations WHERE \"chatwootId\" LIKE 'conv_9960%' ORDER BY \"chatwootId\";"
echo "=== DONE. Open the Triage Inbox and press Regenerate triage on each seeded entry. ==="
