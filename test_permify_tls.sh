#!/bin/bash
# Test whether the portal can talk to permify-secure-proxy over TLS.
# Runs INSIDE the current July pod (it has node + @permify SDK).
# Read-only network probes; no config is changed.
set -u
K="docker exec newwave-dev-control-plane kubectl -n lanai"
POD=$($K get pods -l app=lanai-portal --field-selector=status.phase=Running --no-headers | head -1 | awk '{print $1}')
echo "testing from live pod: $POD"

echo "=== [1/4] TLS handshake + certificate trust (node, default CA store) ==="
$K exec $POD -c lanai-portal -- node -e "
const tls = require('node:tls');
const s = tls.connect({ host: 'permify-secure-proxy', port: 8443, servername: 'permify-secure-proxy', rejectUnauthorized: true }, () => {
  console.log('HANDSHAKE OK, authorized:', s.authorized);
  console.log('cert subject:', JSON.stringify(s.getPeerCertificate().subject));
  console.log('protocol:', s.getProtocol());
  s.end();
});
s.setTimeout(8000, () => { console.log('TIMEOUT'); s.destroy(); process.exit(0); });
s.on('error', (e) => { console.log('TLS ERROR:', e.message, '| code:', e.code); process.exit(0); });
" 2>&1

echo "=== [2/4] what cert does it present (untrusted view)? ==="
$K exec $POD -c lanai-portal -- node -e "
const tls = require('node:tls');
const s = tls.connect({ host: 'permify-secure-proxy', port: 8443, rejectUnauthorized: false }, () => {
  const c = s.getPeerCertificate();
  console.log('subject:', JSON.stringify(c.subject));
  console.log('issuer:', JSON.stringify(c.issuer));
  console.log('valid to:', c.valid_to);
  console.log('SAN:', JSON.stringify(c.subjectaltname || 'none'));
  s.end(); process.exit(0);
});
s.setTimeout(8000, () => { console.log('TIMEOUT'); process.exit(0); });
s.on('error', (e) => { console.log('ERR:', e.message); process.exit(0); });
" 2>&1

echo "=== [3/4] real gRPC permission check over TLS (the exact call the middleware makes) ==="
$K exec $POD -c lanai-portal -- node -e "
import('@permify/permify-node').then(async (permify) => {
  try {
    const client = permify.grpc.newClient({
      endpoint: 'permify-secure-proxy:8443',
      insecure: false,
      timeout: 8000,
    });
    const res = await client.permission.check({
      tenantId: 'lanai',
      metadata: {},
      entity: { type: 'platform', id: 'lanai' },
      permission: 'manage',
      subject: { type: 'user', id: 'tls-probe-nonexistent' },
      schemaVersion: '',
    });
    console.log('GRPC-TLS CALL SUCCEEDED, can:', JSON.stringify(res.can));
    process.exit(0);
  } catch (e) {
    console.log('GRPC-TLS FAILED:', e.message || e);
    process.exit(0);
  }
});
" 2>&1

echo "=== [4/4] same call insecure to :3478 (July's working path, control group) ==="
$K exec $POD -c lanai-portal -- node -e "
import('@permify/permify-node').then(async (permify) => {
  try {
    const client = permify.grpc.newClient({
      endpoint: 'permify.permify.svc.cluster.local:3478',
      insecure: true,
      timeout: 8000,
    });
    const res = await client.permission.check({
      tenantId: 'lanai',
      metadata: {},
      entity: { type: 'platform', id: 'lanai' },
      permission: 'manage',
      subject: { type: 'user', id: 'tls-probe-nonexistent' },
      schemaVersion: '',
    });
    console.log('GRPC-INSECURE CALL SUCCEEDED, can:', JSON.stringify(res.can));
    process.exit(0);
  } catch (e) {
    console.log('GRPC-INSECURE FAILED:', e.message || e);
    process.exit(0);
  }
});
" 2>&1
