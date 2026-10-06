#!/usr/bin/env bash
# One-time AWS setup for AI Function Studio (idempotent). Requires an admin AWS CLI session.
#  - ContextControlFunctionExecRole: role tenant functions run as (CloudWatch Logs only)
#  - cc-function-deployer: creates ccfn-* functions (Amplify compute cannot pass IAM roles)
#  - ContextControlAmplifyComputeRole/tenant-functions: app may manage ccfn-* and invoke the deployer
set -euo pipefail
REGION="${AWS_REGION:-us-east-2}"
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
COMPUTE_ROLE=ContextControlAmplifyComputeRole
EXEC_ROLE=ContextControlFunctionExecRole
DEPLOYER_ROLE=ContextControlFunctionDeployerRole
DEPLOYER=cc-function-deployer
DIR=$(cd "$(dirname "$0")/../.." && pwd)
TMP=$(mktemp -d)
LAMBDA_TRUST='{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}'

ensure_role() {
  aws iam get-role --role-name "$1" >/dev/null 2>&1 || aws iam create-role --role-name "$1" --assume-role-policy-document "$LAMBDA_TRUST" --description "$2" >/dev/null
  aws iam attach-role-policy --role-name "$1" --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
}
ensure_role "$EXEC_ROLE" "Execution role for Context Control tenant functions: CloudWatch Logs only"
ensure_role "$DEPLOYER_ROLE" "Creates Context Control tenant functions (ccfn-*) with the logs-only execution role"

aws iam put-role-policy --role-name "$DEPLOYER_ROLE" --policy-name create-tenant-functions --policy-document "{
  \"Version\":\"2012-10-17\",\"Statement\":[
   {\"Effect\":\"Allow\",\"Action\":[\"lambda:CreateFunction\",\"lambda:TagResource\"],\"Resource\":\"arn:aws:lambda:$REGION:$ACCOUNT:function:ccfn-*\"},
   {\"Effect\":\"Allow\",\"Action\":\"iam:PassRole\",\"Resource\":\"arn:aws:iam::$ACCOUNT:role/$EXEC_ROLE\",\"Condition\":{\"StringEquals\":{\"iam:PassedToService\":\"lambda.amazonaws.com\"}}}]}"

aws iam put-role-policy --role-name "$COMPUTE_ROLE" --policy-name tenant-functions --policy-document "{
  \"Version\":\"2012-10-17\",\"Statement\":[
   {\"Effect\":\"Allow\",\"Action\":[\"lambda:UpdateFunctionCode\",\"lambda:UpdateFunctionConfiguration\",\"lambda:InvokeFunction\",\"lambda:GetFunction\",\"lambda:GetFunctionConfiguration\",\"lambda:DeleteFunction\"],\"Resource\":\"arn:aws:lambda:$REGION:$ACCOUNT:function:ccfn-*\"},
   {\"Effect\":\"Allow\",\"Action\":\"lambda:InvokeFunction\",\"Resource\":\"arn:aws:lambda:$REGION:$ACCOUNT:function:$DEPLOYER\"}]}"

(cd "$DIR/infra/function-deployer" && zip -q "$TMP/deployer.zip" index.mjs)
if aws lambda get-function --function-name "$DEPLOYER" --region "$REGION" >/dev/null 2>&1; then
  aws lambda update-function-code --function-name "$DEPLOYER" --zip-file "fileb://$TMP/deployer.zip" --region "$REGION" >/dev/null
else
  sleep 10 # new IAM roles take a moment to become assumable
  aws lambda create-function --function-name "$DEPLOYER" --runtime nodejs22.x --handler index.handler --architectures arm64 \
    --role "arn:aws:iam::$ACCOUNT:role/$DEPLOYER_ROLE" --timeout 30 --memory-size 256 \
    --environment "Variables={EXEC_ROLE_ARN=arn:aws:iam::$ACCOUNT:role/$EXEC_ROLE}" \
    --zip-file "fileb://$TMP/deployer.zip" --region "$REGION" >/dev/null
fi
aws lambda wait function-active-v2 --function-name "$DEPLOYER" --region "$REGION"
echo "Function Studio AWS setup complete (deployer: $DEPLOYER)."
