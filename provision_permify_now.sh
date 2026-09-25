#!/bin/bash
# Run from the Mac:  bash /Users/oluwajobamalomo/lanai/provision_permify_now.sh
# Idempotent: safe to run twice.
set -e

HOST=newwaveclaw@america

echo "=== Step 1: provision Permify tenant + schema + owner tuples ==="
base64 -i /Users/oluwajobamalomo/lanai/config/permify/schema.perm | ssh "$HOST" "docker exec -i newwave-dev-control-plane kubectl -n lanai exec -i deploy/lanai-portal -c lanai-portal -- node -e \"
const permify = require('@permify/permify-node');
let b64 = '';
process.stdin.on('data', d => b64 += d.toString().trim());
process.stdin.on('end', async () => {
  try {
    const schema = Buffer.from(b64, 'base64').toString('utf8');
    const c = permify.grpc.newClient({ endpoint: process.env.PERMIFY_GRPC_ADDRESS, insecure: true, timeout: 15000 });
    const tenant = process.env.PERMIFY_TENANT_ID || 'lanai';
    await c.tenancy.create({ id: tenant, name: 'Lanai Lifestyle Platform' }).catch(() => console.log('tenant already exists, continuing'));
    console.log('tenant ok');
    const r = await c.schema.write({ tenantId: tenant, schema });
    console.log('SCHEMA_VERSION=' + r.schemaVersion);
    for (const id of [1,2,3,4,5,6,7,8,9]) {
      await c.data.write({ tenantId: tenant, metadata: { schemaVersion: r.schemaVersion }, tuples: [{ entity: { type: 'member_record', id: String(id) }, relation: 'owner', subject: { type: 'member', id: String(id) } }] });
    }
    console.log('tuples written for members 1-9');
    process.exit(0);
  } catch (e) { console.error('ERR', e.message || String(e)); process.exit(1); }
});
\""

echo
echo "=== Step 2: pin the schema version on the portal deployment (triggers rollout) ==="
ssh "$HOST" "docker exec newwave-dev-control-plane kubectl -n lanai set env deployment/lanai-portal PERMIFY_SCHEMA_VERSION=\$(docker exec newwave-dev-control-plane kubectl -n lanai exec deploy/lanai-portal -c lanai-portal -- node -e '
const permify = require(\"@permify/permify-node\");
const c = permify.grpc.newClient({ endpoint: process.env.PERMIFY_GRPC_ADDRESS, insecure: true, timeout: 15000 });
c.schema.list({ tenantId: process.env.PERMIFY_TENANT_ID || \"lanai\" }).then(r => {
  const v = r.versions && r.versions.length ? r.versions[r.versions.length-1].version : null;
  console.log(v);
}).catch(e => { console.error(String(e)); process.exit(1); });
')" 2>/dev/null || {
  echo "If the one-liner above failed, run this manually with the SCHEMA_VERSION printed in step 1:"
  echo "  ssh $HOST 'docker exec newwave-dev-control-plane kubectl -n lanai set env deployment/lanai-portal PERMIFY_SCHEMA_VERSION=<VERSION>'"
}

echo
echo "=== Step 3: wait for rollout and verify ==="
ssh "$HOST" 'docker exec newwave-dev-control-plane kubectl -n lanai rollout status deployment/lanai-portal --timeout=180s'

echo
echo "=== Step 4: end-to-end member check (login then myBookings) ==="
COOKIE=/tmp/lanai_verify_cookie.txt
rm -f "$COOKIE"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -c "$COOKIE" https://lanai.newfire.app/api/trpc/memberAuth.login \
  -H 'Content-Type: application/json' \
  --data '{"json":{"email":"eleanor.vance@example.com","pin":"Lanai2026"}}')
echo "login: $CODE"
curl -s -b "$COOKIE" https://lanai.newfire.app/api/trpc/bookings.myBookings | head -c 400
echo
echo "=== Step 5: advisor@lanai.test emailVerified fix (Keycloak, one-liner) ==="
echo "Run this too, then sign in as advisor@lanai.test:"
echo "  ssh $HOST 'docker exec newwave-dev-control-plane kubectl -n lanai exec deploy/keycloak -- bash -c \"cd /opt/keycloak/bin && ./kcadm.sh config credentials --server http://localhost:8080 --realm master --user \\\$KC_BOOTSTRAP_ADMIN_USERNAME --password \\\$KC_BOOTSTRAP_ADMIN_PASSWORD && UID_=$(./kcadm.sh get users -r lanai -q username=advisor@lanai.test --fields id --format csv --noquotes | tail -1) && ./kcadm.sh update users/\$UID_ -r lanai -s emailVerified=true\"'"
