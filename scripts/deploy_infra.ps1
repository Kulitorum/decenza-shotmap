<#
.SYNOPSIS
    Build Lambda functions and deploy infrastructure with Terraform

.PARAMETER Plan
    Only show Terraform plan, don't apply

.PARAMETER Destroy
    Destroy infrastructure

.EXAMPLE
    .\deploy_infra.ps1
    .\deploy_infra.ps1 -Plan
    .\deploy_infra.ps1 -Destroy
#>

param(
    [switch]$Plan,
    [switch]$Destroy
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Split-Path -Parent $ScriptDir
$BackendDir = Join-Path $RootDir "backend"
$InfraDir = Join-Path $RootDir "infra"
$DistDir = Join-Path $BackendDir "dist"

# Build Lambda functions
Write-Host "Building Lambda functions..." -ForegroundColor Cyan
Push-Location $BackendDir
try {
    npm ci
    npm run build

    # Create zip files for each Lambda
    $Lambdas = @(
        "ingestShot",
        "getStats",
        "getRecentShots",
        "wsConnect",
        "wsDisconnect",
        "wsMessage",
        "exportShots",
        "crashReport",
        "libraryCreate",
        "libraryList",
        "libraryGet",
        "libraryDownload",
        "libraryDelete",
        "libraryFlag"
    )

    foreach ($Lambda in $Lambdas) {
        $MjsFile = Join-Path $DistDir "$Lambda.mjs"
        $ZipFile = Join-Path $DistDir "$Lambda.zip"

        if (Test-Path $ZipFile) {
            Remove-Item $ZipFile -Force
        }

        Write-Host "Creating $Lambda.zip..." -ForegroundColor Yellow
        Compress-Archive -Path $MjsFile -DestinationPath $ZipFile -Force
    }
} finally {
    Pop-Location
}

# Run Terraform
Write-Host "Running Terraform..." -ForegroundColor Cyan
Push-Location $InfraDir
try {
    terraform init

    if ($Destroy) {
        terraform destroy
    } elseif ($Plan) {
        terraform plan
    } else {
        terraform apply
    }
} finally {
    Pop-Location
}

if (-not $Plan -and -not $Destroy) {
    Write-Host "`nDeployment complete!" -ForegroundColor Green
    Write-Host "Website URL: $(terraform output -raw website_url)" -ForegroundColor Cyan
    Write-Host "API URL: $(terraform output -raw api_url)" -ForegroundColor Cyan
    Write-Host "WebSocket URL: $(terraform output -raw ws_url)" -ForegroundColor Cyan
}
