<#
.SYNOPSIS
    Deploy frontend to S3 and invalidate CloudFront cache

.PARAMETER BucketName
    S3 bucket name (from Terraform output)

.PARAMETER DistributionId
    CloudFront distribution ID (from Terraform output)

.EXAMPLE
    .\deploy_frontend.ps1 -BucketName "decenza-shotmap-website-123456789" -DistributionId "E1234567890ABC"
#>

param(
    [Parameter(Mandatory=$false)]
    [string]$BucketName,

    [Parameter(Mandatory=$false)]
    [string]$DistributionId
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Split-Path -Parent $ScriptDir
$FrontendDir = Join-Path $RootDir "frontend"
$InfraDir = Join-Path $RootDir "infra"

Write-Host "Building frontend..." -ForegroundColor Cyan
Push-Location $FrontendDir
try {
    npm ci
    npm run build
} finally {
    Pop-Location
}

# Get values from Terraform if not provided
if (-not $BucketName -or -not $DistributionId) {
    Write-Host "Getting configuration from Terraform outputs..." -ForegroundColor Cyan
    Push-Location $InfraDir
    try {
        if (-not $BucketName) {
            $BucketName = terraform output -raw s3_bucket_name
        }
        if (-not $DistributionId) {
            $DistributionId = terraform output -raw cloudfront_distribution_id
        }
    } finally {
        Pop-Location
    }
}

Write-Host "Deploying to S3 bucket: $BucketName" -ForegroundColor Cyan

$DistDir = Join-Path $FrontendDir "dist"

# Sync files to S3
# HTML files: no-cache
Write-Host "Uploading HTML files (no-cache)..." -ForegroundColor Yellow
aws s3 sync $DistDir "s3://$BucketName" `
    --exclude "*" `
    --include "*.html" `
    --cache-control "no-cache, no-store, must-revalidate" `
    --content-type "text/html" `
    --delete

# Assets (JS, CSS, images): long cache with immutable
Write-Host "Uploading assets (long cache)..." -ForegroundColor Yellow
aws s3 sync $DistDir "s3://$BucketName" `
    --exclude "*.html" `
    --cache-control "public, max-age=31536000, immutable" `
    --delete

# Invalidate CloudFront cache
Write-Host "Invalidating CloudFront cache..." -ForegroundColor Cyan
$InvalidationId = aws cloudfront create-invalidation `
    --distribution-id $DistributionId `
    --paths "/*" `
    --query "Invalidation.Id" `
    --output text

Write-Host "Invalidation created: $InvalidationId" -ForegroundColor Green
Write-Host "Deployment complete!" -ForegroundColor Green
