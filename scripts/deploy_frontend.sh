#!/bin/bash
set -e

# Deploy frontend to S3 and invalidate CloudFront cache
# Usage: ./deploy_frontend.sh [bucket_name] [distribution_id]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
FRONTEND_DIR="$ROOT_DIR/frontend"
INFRA_DIR="$ROOT_DIR/infra"

BUCKET_NAME="${1:-}"
DISTRIBUTION_ID="${2:-}"

echo "Building frontend..."
cd "$FRONTEND_DIR"
npm ci
npm run build

# Get values from Terraform if not provided
if [ -z "$BUCKET_NAME" ] || [ -z "$DISTRIBUTION_ID" ]; then
    echo "Getting configuration from Terraform outputs..."
    cd "$INFRA_DIR"

    if [ -z "$BUCKET_NAME" ]; then
        BUCKET_NAME=$(terraform output -raw s3_bucket_name)
    fi

    if [ -z "$DISTRIBUTION_ID" ]; then
        DISTRIBUTION_ID=$(terraform output -raw cloudfront_distribution_id)
    fi
fi

echo "Deploying to S3 bucket: $BUCKET_NAME"

DIST_DIR="$FRONTEND_DIR/dist"

# Sync HTML files with no-cache
echo "Uploading HTML files (no-cache)..."
aws s3 sync "$DIST_DIR" "s3://$BUCKET_NAME" \
    --exclude "*" \
    --include "*.html" \
    --cache-control "no-cache, no-store, must-revalidate" \
    --content-type "text/html" \
    --delete

# Sync other assets with long cache
echo "Uploading assets (long cache)..."
aws s3 sync "$DIST_DIR" "s3://$BUCKET_NAME" \
    --exclude "*.html" \
    --cache-control "public, max-age=31536000, immutable" \
    --delete

# Invalidate CloudFront cache
echo "Invalidating CloudFront cache..."
INVALIDATION_ID=$(aws cloudfront create-invalidation \
    --distribution-id "$DISTRIBUTION_ID" \
    --paths "/*" \
    --query "Invalidation.Id" \
    --output text)

echo "Invalidation created: $INVALIDATION_ID"
echo "Deployment complete!"
