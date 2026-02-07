#!/bin/bash
set -e

# Build Lambda functions and deploy infrastructure with Terraform
# Usage: ./deploy_infra.sh [plan|destroy]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
BACKEND_DIR="$ROOT_DIR/backend"
INFRA_DIR="$ROOT_DIR/infra"
DIST_DIR="$BACKEND_DIR/dist"

ACTION="${1:-apply}"

# Build Lambda functions
echo "Building Lambda functions..."
cd "$BACKEND_DIR"
npm ci
npm run build

# Create zip files for each Lambda
LAMBDAS=(
    "ingestShot"
    "getStats"
    "getRecentShots"
    "wsConnect"
    "wsDisconnect"
    "wsMessage"
    "exportShots"
    "crashReport"
    "libraryCreate"
    "libraryList"
    "libraryGet"
    "libraryDownload"
    "libraryDelete"
    "libraryFlag"
    "libraryThumbnail"
)

for LAMBDA in "${LAMBDAS[@]}"; do
    MJS_FILE="$DIST_DIR/$LAMBDA.mjs"
    ZIP_FILE="$DIST_DIR/$LAMBDA.zip"

    if [ -f "$ZIP_FILE" ]; then
        rm "$ZIP_FILE"
    fi

    echo "Creating $LAMBDA.zip..."
    cd "$DIST_DIR"
    zip -j "$ZIP_FILE" "$MJS_FILE"
done

# Run Terraform
echo "Running Terraform..."
cd "$INFRA_DIR"
terraform init

case "$ACTION" in
    plan)
        terraform plan
        ;;
    destroy)
        terraform destroy
        ;;
    *)
        terraform apply

        echo ""
        echo "Deployment complete!"
        echo "Website URL: $(terraform output -raw website_url)"
        echo "API URL: $(terraform output -raw api_url)"
        echo "WebSocket URL: $(terraform output -raw ws_url)"
        ;;
esac
