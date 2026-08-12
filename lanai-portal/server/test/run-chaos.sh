#!/bin/bash
set -e

cd /home/ubuntu/lanai/lanai-portal

echo "=== 1. Starting Chaos Worker ==="
DATABASE_URL="postgresql://lanai:lanai_password@localhost:5432/lanai" npx ts-node server/test/chaos-simulation.ts worker-chaos &
WORKER_PID=$!
sleep 5

echo "=== 2. Triggering Financial Saga ==="
WORKFLOW_ID=$(DATABASE_URL="postgresql://lanai:lanai_password@localhost:5432/lanai" npx ts-node server/test/chaos-simulation.ts trigger | grep "ID:" | awk '{print $7}')
echo "Workflow ID: $WORKFLOW_ID"
sleep 2

echo "=== 3. Waiting for Chaos Worker to Crash ==="
wait $WORKER_PID || echo "Worker crashed as expected (SIGKILL)"
sleep 2

echo "=== 4. Starting Recovery Worker ==="
DATABASE_URL="postgresql://lanai:lanai_password@localhost:5432/lanai" npx ts-node server/test/chaos-simulation.ts worker-recovery &
RECOVERY_PID=$!
sleep 5

echo "=== 5. Verifying Recovery ==="
DATABASE_URL="postgresql://lanai:lanai_password@localhost:5432/lanai" npx ts-node server/test/chaos-simulation.ts verify $WORKFLOW_ID

kill $RECOVERY_PID
