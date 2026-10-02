#!/bin/bash
# Commit and push the P4 + deployment assets, then verify.
set -u
cd /Users/oluwajobamalomo/lanai || exit 1
git commit -m "P4 + deployment assets: unified conversation screen, whisper manifest, deploy + seed scripts

Co-Authored-By: Claude Code <noreply@anthropic.com>"
git push origin pilot/requirements-baseline-2026-09
echo "PUSH-RESULT: $?"
git log --oneline -1