#!/bin/bash
# Run from the Mac:  bash /Users/oluwajobamalomo/lanai/fix_demo_logins.sh
# v4: streams pinfix.js into the pod via stdin (proven mechanism, no kubectl cp).
# Then verifies persona logins and flips advisor@lanai.test emailVerified.
set -e
HOST=newwaveclaw@america
LOCAL_JS=/Users/oluwajobamalomo/lanai/pinfix.js

echo "=== Step 1: stream pinfix.js into the portal pod ==="
POD=$(ssh "$HOST" 'docker exec newwave-dev-control-plane kubectl -n lanai get pod -l app=lanai-portal -o jsonpath="{.items[0].metadata.name}"')
echo "pod: $POD"
cat "$LOCAL_JS" | ssh "$HOST" "docker exec -i newwave-dev-control-plane kubectl -n lanai exec -i $POD -c lanai-portal -- sh -c 'cat > /tmp/pinfix.js'"
ssh "$HOST" "docker exec newwave-dev-control-plane kubectl -n lanai exec $POD -c lanai-portal -- wc -c /tmp/pinfix.js"

echo
echo "=== Step 2: run it (updates 4 personas to PIN 2026) ==="
ssh "$HOST" "docker exec newwave-dev-control-plane kubectl -n lanai exec $POD -c lanai-portal -- node /tmp/pinfix.js"
ssh "$HOST" "docker exec newwave-dev-control-plane kubectl -n lanai exec $POD -c lanai-portal -- rm /tmp/pinfix.js"

echo
echo "=== Step 3: verify all four persona logins ==="
for m in eleanor.vance marcus.chen sofia.almeida james.whitfield; do
  rm -f /tmp/lanai_v.txt
  CODE=$(curl -s -o /dev/null -w '%{http_code}' -c /tmp/lanai_v.txt https://lanai.newfire.app/api/trpc/memberAuth.login \
    -H 'Content-Type: application/json' --data "{\"json\":{\"email\":\"$m@example.com\",\"pin\":\"2026\"}}")
  echo "$m@example.com login: $CODE"
done
rm -f /tmp/lanai_v.txt
curl -s -o /dev/null -c /tmp/lanai_v.txt https://lanai.newfire.app/api/trpc/memberAuth.login -H 'Content-Type: application/json' --data '{"json":{"email":"eleanor.vance@example.com","pin":"2026"}}'
echo "My Bookings (Eleanor):"
curl -s -b /tmp/lanai_v.txt https://lanai.newfire.app/api/trpc/bookings.myBookings | head -c 300
echo

echo
echo "=== Step 4: advisor@lanai.test emailVerified fix ==="
ssh "$HOST" 'docker exec newwave-dev-control-plane kubectl -n lanai exec deploy/keycloak -- bash -c '"'"'cd /opt/keycloak/bin && ./kcadm.sh config credentials --server http://localhost:8080 --realm master --user "$KC_BOOTSTRAP_ADMIN_USERNAME" --password "$KC_BOOTSTRAP_ADMIN_PASSWORD" && UID_=$(./kcadm.sh get users -r lanai -q username=advisor@lanai.test --fields id --format csv --noquotes | tail -1) && ./kcadm.sh update users/$UID_ -r lanai -s emailVerified=true && echo ADVISOR_EMAILVERIFIED_SET'"'"''
