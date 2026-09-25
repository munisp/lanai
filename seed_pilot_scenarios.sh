#!/bin/bash
# Seed the four SR-303 urgency scenarios for the demo (Tue 29 Sep).
# Run on the host:  ssh newwaveclaw@america 'bash -s' < seed_pilot_scenarios.sh
#
# Synthetic demo data (SR-303), not real client data. Inserts 4 conversations
# + messages into the mirror tables with fixed ids conv_9960xx / msg_9960xx
# for eleanor.vance@example.com. Triage does not run on a direct insert;
# after seeding, use "Regenerate triage" in the Triage Inbox for each entry.

set -u
K="docker exec newwave-dev-control-plane kubectl -n lanai"
PSQL="$K exec -i deploy/postgres -- psql -U lanai -d lanai"
echo "=== seeding SR-303 scenarios (eleanor.vance@example.com) ==="
$PSQL <<'SQL'
WITH m AS (SELECT id FROM members WHERE email = 'eleanor.vance@example.com'),
c AS (
  INSERT INTO chatwoot_conversations (chatwootId, "memberId", "contactIdentifier", "contactName", channel, status, "lastMessage", "advisorResponded", "memberSeen", "updatedAt")
  SELECT 'conv_996001', m.id, '+15550009961', 'Eleanor Vance', 'whatsapp', 'open',
         'My flight home was cancelled and the hotel says they cannot find my reservation either.',
         false, true, now()
  FROM m
  ON CONFLICT (chatwootId) DO UPDATE SET "lastMessage" = EXCLUDED."lastMessage", "updatedAt" = now()
  RETURNING id
)
INSERT INTO chatwoot_messages (chatwootId, "conversationId", "messageType", content, "transcriptionStatus")
SELECT 'msg_996001', c.id, 'inbound',
  'My flight cancellation and the hotel cannot find my reservation. Please help.',
  'none'
FROM c
ON CONFLICT (chatwootId) DO UPDATE SET content = EXCLUDED.content;
SQL
$PSQL <<'SQL2'
WITH m AS (SELECT id FROM members WHERE email = 'eleanor.vance@example.com'),
c AS (
  INSERT INTO chatwoot_conversations (chatwootId, "memberId", "contactIdentifier", "contactName", channel, status, "lastMessage", "advisorResponded", "memberSeen", "updatedAt")
  SELECT 'conv_996002', m.id, '+15550009962', 'Eleanor Vance', 'whatsapp', 'open',
         'Can you book us a table for four tonight? Something special.',
         false, true, now()
  FROM m
  ON CONFLICT (chatwootId) DO UPDATE SET "lastMessage" = EXCLUDED."lastMessage", "updatedAt" = now()
  RETURNING id
)
INSERT INTO chatwoot_messages (chatwootId, "conversationId", "messageType", content, "transcriptionStatus")
SELECT 'msg_996002', c.id, 'inbound',
  'Can you book us a table for four tonight? Something special.',
  'none'
FROM c
ON CONFLICT (chatwootId) DO UPDATE SET content = EXCLUDED.content;

WITH m AS (SELECT id FROM members WHERE email = 'eleanor.vance@example.com'),
c AS (
  INSERT INTO chatwoot_conversations (chatwootId, "memberId", "contactIdentifier", "contactName", channel, status, "lastMessage", "advisorResponded", "memberSeen", "updatedAt")
  SELECT 'conv_996003', m.id, '+15550009963', 'Eleanor Vance', 'whatsapp', 'open',
         'Any last-minute tickets for the gala this weekend?',
         false, true, now()
  FROM m
  ON CONFLICT (chatwootId) DO UPDATE SET "lastMessage" = EXCLUDED."lastMessage", "updatedAt" = now()
  RETURNING id
)
INSERT INTO chatwoot_messages (chatwootId, "conversationId", "messageType", content, "transcriptionStatus")
SELECT 'msg_996003', c.id, 'inbound',
  'Any last-minute tickets for the gala this weekend?',
  'none'
FROM c
ON CONFLICT (chatwootId) DO UPDATE SET content = EXCLUDED.content;

$PSQL <<'SQL3'
WITH m AS (SELECT id FROM members WHERE email = 'eleanor.vance@example.com'),
c AS (
  INSERT INTO chatwoot_conversations (chatwootId, "memberId", "contactIdentifier", "contactName", channel, status, "lastMessage", "advisorResponded", "memberSeen", "updatedAt")
  SELECT 'conv_996004', m.id, '+15550009964', 'Eleanor Vance', 'whatsapp', 'open',
         'The hotel cannot find our group booking and check-in is in two hours.',
         false, true, now()
  FROM m
  ON CONFLICT (chatwootId) DO UPDATE SET "lastMessage" = EXCLUDED."lastMessage", "updatedAt" = now()
  RETURNING id
)
INSERT INTO chatwoot_messages (chatwootId, "conversationId", "messageType", content, "transcriptionStatus")
SELECT 'msg_996004', c.id, 'inbound',
  'The hotel cannot find our group booking and check-in is in two hours.',
  'none'
FROM c
ON CONFLICT (chatwootId) DO UPDATE SET content = EXCLUDED.content;
SQL3

echo "=== verifying seeded rows ==="
$K exec deploy/postgres -- psql -U lanai -d lanai -c "SELECT chatwootId, \"lastMessage\" FROM chatwoot_conversations WHERE chatwootId LIKE 'conv_9960%' ORDER BY chatwootId;"
echo "=== DONE. Open the Triage Inbox and press Regenerate triage on each seeded entry. ==="
