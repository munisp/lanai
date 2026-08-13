#!/usr/bin/env bash
# Export immutable evidence from a completed isolated ledger-soak Job.
# The caller is responsible for uploading the resulting archive to their
# approved retention-controlled object store or compliance repository.
set -euo pipefail

namespace="${NAMESPACE:-lanai-loadtest}"
job_name="${1:-}"
output_dir="${OUTPUT_DIR:-./soak-evidence}"

if [[ -z "$job_name" ]]; then
  printf 'Usage: %s <completed-job-name>\n' "$0" >&2
  exit 2
fi

command -v kubectl >/dev/null 2>&1 || { printf '%s\n' 'kubectl is required' >&2; exit 2; }
command -v sha256sum >/dev/null 2>&1 || { printf '%s\n' 'sha256sum is required' >&2; exit 2; }

completion="$(kubectl -n "$namespace" get job "$job_name" -o jsonpath='{.status.conditions[?(@.type=="Complete")].status}')"
if [[ "$completion" != "True" ]]; then
  printf 'Refusing export: Job %s is not complete.\n' "$job_name" >&2
  exit 2
fi

pod="$(kubectl -n "$namespace" get pods -l job-name="$job_name" -o jsonpath='{.items[0].metadata.name}')"
[[ -n "$pod" ]] || { printf 'No pod found for Job %s.\n' "$job_name" >&2; exit 2; }

bundle_dir="$output_dir/$job_name"
mkdir -p "$bundle_dir"
kubectl -n "$namespace" logs "$pod" --timestamps > "$bundle_dir/pod.log"
kubectl -n "$namespace" cp "$pod:/evidence" "$bundle_dir/evidence"
kubectl -n "$namespace" get job "$job_name" -o yaml > "$bundle_dir/job.yaml"
kubectl -n "$namespace" get pod "$pod" -o yaml > "$bundle_dir/pod.yaml"

(
  cd "$bundle_dir"
  find . -type f -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS
)
tar -C "$output_dir" -czf "$output_dir/$job_name.tar.gz" "$job_name"
sha256sum "$output_dir/$job_name.tar.gz" > "$output_dir/$job_name.tar.gz.sha256"

printf 'Evidence bundle: %s\nSHA-256: %s\n' \
  "$output_dir/$job_name.tar.gz" \
  "$(cat "$output_dir/$job_name.tar.gz.sha256")"
