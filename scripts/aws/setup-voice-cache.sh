#!/usr/bin/env bash
# Voice media bucket (lib/voice/audio-cache.ts):
#  - tts/      spoken-audio cache for voice replies (expires after VOICE_CACHE_DAYS, default 90)
#  - inbound/  call recordings from the Inbound Gateway (expire after INBOUND_MEDIA_DAYS, default 365)
#  - private S3 bucket cc-voice-cache-<account>, encrypted, public access blocked
#  - clips expire after VOICE_CACHE_DAYS (default 90) through a lifecycle rule
#  - the Amplify compute role may only read/write objects under tts/ in that bucket
#    (ListBucket on tts/ so a cache miss is a clean 404 instead of AccessDenied)
# Re-runnable. The deploy workflow sets VOICE_CACHE_BUCKET when the bucket exists.
set -euo pipefail

REGION="${AWS_REGION:-us-east-2}"
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
BUCKET="cc-voice-cache-$ACCOUNT"
DAYS="${VOICE_CACHE_DAYS:-90}"
INBOUND_DAYS="${INBOUND_MEDIA_DAYS:-365}"
COMPUTE_ROLE=ContextControlAmplifyComputeRole

if ! aws s3api head-bucket --bucket "$BUCKET" 2>/dev/null; then
  aws s3api create-bucket --bucket "$BUCKET" --region "$REGION" --create-bucket-configuration "LocationConstraint=$REGION" >/dev/null
fi
aws s3api put-public-access-block --bucket "$BUCKET" --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
aws s3api put-bucket-encryption --bucket "$BUCKET" --server-side-encryption-configuration \
  '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"},"BucketKeyEnabled":true}]}'
aws s3api put-bucket-ownership-controls --bucket "$BUCKET" --ownership-controls '{"Rules":[{"ObjectOwnership":"BucketOwnerEnforced"}]}'
aws s3api put-bucket-lifecycle-configuration --bucket "$BUCKET" --lifecycle-configuration "{
  \"Rules\":[{\"ID\":\"expire-tts-clips\",\"Status\":\"Enabled\",\"Filter\":{\"Prefix\":\"tts/\"},\"Expiration\":{\"Days\":$DAYS},
  \"AbortIncompleteMultipartUpload\":{\"DaysAfterInitiation\":1}},
  {\"ID\":\"expire-inbound-media\",\"Status\":\"Enabled\",\"Filter\":{\"Prefix\":\"inbound/\"},\"Expiration\":{\"Days\":$INBOUND_DAYS},
  \"AbortIncompleteMultipartUpload\":{\"DaysAfterInitiation\":1}}]}"
aws s3api put-bucket-tagging --bucket "$BUCKET" --tagging 'TagSet=[{Key=app,Value=context-control},{Key=purpose,Value=voice-media}]'

aws iam put-role-policy --role-name "$COMPUTE_ROLE" --policy-name voice-audio-cache --policy-document "{
  \"Version\":\"2012-10-17\",\"Statement\":[
   {\"Effect\":\"Allow\",\"Action\":[\"s3:GetObject\",\"s3:PutObject\"],\"Resource\":[\"arn:aws:s3:::$BUCKET/tts/*\",\"arn:aws:s3:::$BUCKET/inbound/*\"]},
   {\"Effect\":\"Allow\",\"Action\":\"s3:ListBucket\",\"Resource\":\"arn:aws:s3:::$BUCKET\",\"Condition\":{\"StringLike\":{\"s3:prefix\":[\"tts/*\",\"inbound/*\"]}}}]}"

echo "Voice media bucket: $BUCKET ($REGION). tts/ expires after $DAYS days, inbound/ after $INBOUND_DAYS days."
