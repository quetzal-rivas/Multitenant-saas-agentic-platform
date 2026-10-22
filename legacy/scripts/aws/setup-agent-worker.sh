#!/usr/bin/env bash
# One-time AWS setup for the agent worker (idempotent). Requires an admin AWS CLI session.
#  - ContextControlAgentWorkerRole: logs, KMS (tenant secrets), invoke tenant functions and itself
#  - cc-agent-worker: Node 22 Lambda, 15 min timeout; code + env are refreshed by the deploy workflow
#  - ContextControlAmplifyComputeRole/agent-worker: the web app may start the worker
set -euo pipefail
REGION="${AWS_REGION:-us-east-2}"
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
ROLE=ContextControlAgentWorkerRole
FN=cc-agent-worker
KMS_KEY_ARN="${KMS_KEY_ARN:-arn:aws:kms:$REGION:$ACCOUNT:key/f8991972-fa65-4e48-828f-cabdd581685b}"
DIR=$(cd "$(dirname "$0")/../.." && pwd)
TRUST='{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}'

aws iam get-role --role-name "$ROLE" >/dev/null 2>&1 || aws iam create-role --role-name "$ROLE" --assume-role-policy-document "$TRUST" --description "Runs Context Control agent turns" >/dev/null
aws iam attach-role-policy --role-name "$ROLE" --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
aws iam put-role-policy --role-name "$ROLE" --policy-name agent-worker --policy-document "{
  \"Version\":\"2012-10-17\",\"Statement\":[
   {\"Effect\":\"Allow\",\"Action\":[\"kms:Decrypt\",\"kms:GenerateDataKey\"],\"Resource\":\"$KMS_KEY_ARN\"},
   {\"Effect\":\"Allow\",\"Action\":\"lambda:InvokeFunction\",\"Resource\":[\"arn:aws:lambda:$REGION:$ACCOUNT:function:ccfn-*\",\"arn:aws:lambda:$REGION:$ACCOUNT:function:$FN\"]}]}"

aws iam put-role-policy --role-name ContextControlAmplifyComputeRole --policy-name agent-worker --policy-document "{
  \"Version\":\"2012-10-17\",\"Statement\":[
   {\"Effect\":\"Allow\",\"Action\":\"lambda:InvokeFunction\",\"Resource\":\"arn:aws:lambda:$REGION:$ACCOUNT:function:$FN\"}]}"

(cd "$DIR" && node scripts/build-agent-worker.mjs >/dev/null && cd dist/agent-worker && rm -f ../agent-worker.zip && zip -q ../agent-worker.zip index.js)
if aws lambda get-function --function-name "$FN" --region "$REGION" >/dev/null 2>&1; then
  aws lambda update-function-code --function-name "$FN" --zip-file "fileb://$DIR/dist/agent-worker.zip" --region "$REGION" >/dev/null
else
  sleep 10 # new IAM roles take a moment to become assumable
  aws lambda create-function --function-name "$FN" --runtime nodejs22.x --handler index.handler --architectures arm64 \
    --role "arn:aws:iam::$ACCOUNT:role/$ROLE" --timeout 900 --memory-size 512 \
    --environment "Variables={NODE_ENV=production,AGENT_WORKER_FUNCTION=$FN}" \
    --zip-file "fileb://$DIR/dist/agent-worker.zip" --region "$REGION" >/dev/null
fi
aws lambda wait function-active-v2 --function-name "$FN" --region "$REGION"
# Failed async invocations are recovered by the minute tick; don't let Lambda replay them.
aws lambda put-function-event-invoke-config --function-name "$FN" --maximum-retry-attempts 0 --region "$REGION" >/dev/null
echo "Agent worker ready: $FN (the deploy workflow syncs its code and environment)."
