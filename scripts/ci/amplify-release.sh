#!/usr/bin/env bash
# Sync an Amplify app's runtime variables, then build and release its main branch.
# Usage: AMPLIFY_APP_ID=... AMPLIFY_ENV="K1=v1,K2=v2" scripts/ci/amplify-release.sh
# Writes app_url=https://main.<app>.amplifyapp.com to $GITHUB_OUTPUT when it succeeds.
set -euo pipefail
: "${AMPLIFY_APP_ID:?AMPLIFY_APP_ID is required}"
: "${AMPLIFY_ENV:?AMPLIFY_ENV is required}"
BRANCH="${AMPLIFY_BRANCH:-main}"

# Replaces every variable; amplify.yml copies them into .env.production at build time.
aws amplify update-app --app-id "$AMPLIFY_APP_ID" --environment-variables "$AMPLIFY_ENV" >/dev/null
echo "Synced $(printf '%s' "$AMPLIFY_ENV" | tr ',' '\n' | wc -l | tr -d ' ') variables to Amplify app $AMPLIFY_APP_ID (values not printed)."

for jid in $(aws amplify list-jobs --app-id "$AMPLIFY_APP_ID" --branch-name "$BRANCH" \
  --query "jobSummaries[?status=='PENDING' || status=='RUNNING'].jobId" --output text); do
  [ "$jid" = "None" ] && continue
  echo "Stopping pending job $jid"
  aws amplify stop-job --app-id "$AMPLIFY_APP_ID" --branch-name "$BRANCH" --job-id "$jid" >/dev/null || true
done

JOB_ID=$(aws amplify start-job --app-id "$AMPLIFY_APP_ID" --branch-name "$BRANCH" --job-type RELEASE --query 'jobSummary.jobId' --output text)
echo "Waiting for Amplify job $JOB_ID..."
for attempt in $(seq 1 120); do
  STATUS=$(aws amplify get-job --app-id "$AMPLIFY_APP_ID" --branch-name "$BRANCH" --job-id "$JOB_ID" --query 'job.summary.status' --output text)
  case "$STATUS" in
    SUCCEED)
      echo "Amplify job $JOB_ID succeeded."
      [ -n "${GITHUB_OUTPUT:-}" ] && echo "app_url=https://$BRANCH.$AMPLIFY_APP_ID.amplifyapp.com" >> "$GITHUB_OUTPUT"
      exit 0 ;;
    FAILED|CANCELLED)
      echo "ERROR: Amplify job $JOB_ID finished with status $STATUS."
      exit 1 ;;
    *) sleep 10 ;;
  esac
done
echo "ERROR: Amplify job $JOB_ID did not finish within 20 minutes."
exit 1
