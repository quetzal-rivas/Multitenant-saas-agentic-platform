#!/bin/bash
# ==============================================================================
# AWS Free Tier Serverless Container Build & Deployment Script
# Builds the Docker container image for AWS Lambda + FastAPI Mangum adapter
# and pushes to AWS Elastic Container Registry (ECR).
# ==============================================================================

set -e

# Configuration
AWS_REGION=${AWS_REGION:-"us-east-2"}
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query "Account" --output text)
IMAGE_NAME="context-control-backend"
ECR_URI="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${IMAGE_NAME}"

echo "🚀 Starting AWS Free-Tier Serverless Container Deployment Pipeline..."
echo "📋 AWS Account: ${AWS_ACCOUNT_ID} | Region: ${AWS_REGION}"
echo "📦 Image Target: ${ECR_URI}:latest"

# 1. Ensure ECR repository exists
aws ecr describe-repositories --repository-names "${IMAGE_NAME}" --region "${AWS_REGION}" >/dev/null 2>&1 || \
  aws ecr create-repository --repository-name "${IMAGE_NAME}" --region "${AWS_REGION}"

# 2. Authenticate Docker CLI against AWS ECR
echo "🔑 Authenticating Docker CLI with AWS ECR..."
aws ecr get-login-password --region "${AWS_REGION}" | docker login --username AWS --password-stdin "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

# 3. Build Stateless Agent Docker Image
echo "🔨 Building Docker image using AWS Lambda Python 3.11 base image..."
docker build -t "${IMAGE_NAME}:latest" .

# 4. Tag and Push to ECR
echo "🏷️ Tagging and pushing image to AWS ECR..."
docker tag "${IMAGE_NAME}:latest" "${ECR_URI}:latest"
docker push "${ECR_URI}:latest"

echo "✅ Deployment image pushed successfully to ECR!"
echo "📌 Image URI: ${ECR_URI}:latest"
echo "👉 Create or update your AWS Lambda Container function with this Image URI."
