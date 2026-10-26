# Decenza Shot Map

A real-time world map showing espresso shots pulled globally. Open to any espresso app or machine.

## Overview

- **Frontend**: React + TypeScript + MapLibre GL JS
- **Backend**: AWS Lambda + API Gateway + DynamoDB
- **Hosting**: S3 + CloudFront at https://decenza.coffee
- **Real-time**: WebSocket API for live shot updates
- **Map Styles**: Satellite (ESRI) or Street (CARTO Voyager)

## Quick Start

### Prerequisites

- Node.js 20+
- AWS CLI configured with appropriate credentials
- Terraform 1.5+

### Deploy Infrastructure

```bash
cd infra
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your values
terraform init
terraform apply
```

### Deploy Backend

```bash
cd backend
npm ci
npm run build
# Lambdas are deployed via Terraform
```

### Deploy Frontend

From the repository root, use the deployment script so uploaded library images
and API documentation are preserved:

```bash
bash scripts/deploy_frontend.sh <your-bucket-name> <distribution-id>
```

On Windows, use `scripts/deploy_frontend.ps1` with `-BucketName` and
`-DistributionId`. Both scripts can also read these values from Terraform outputs.
Do not sync the entire bucket with an unfiltered `--delete`: it also holds
user-uploaded `library/` images.

### Test with a Shot Event

```bash
curl -X POST https://api.decenza.coffee/v1/shots \
  -H "Content-Type: application/json" \
  -d '{
    "city": "Copenhagen",
    "country_code": "DK",
    "profile": "Classic Espresso",
    "software_name": "MyApp",
    "software_version": "1.0",
    "machine_model": "Decent DE1"
  }'
```

## Project Structure

```
decenza.coffee/
├── frontend/          # React SPA
├── backend/           # Lambda functions
├── infra/             # Terraform IaC
└── docs/              # Documentation
```

## API Endpoints

### Shot Ingestion
POST `https://api.decenza.coffee/v1/shots`

```json
{
  "city": "Copenhagen",
  "country_code": "DK",
  "profile": "My Espresso Profile",
  "software_name": "Decenza|DE1",
  "software_version": "1.2.3",
  "machine_model": "Decent DE1"
}
```

### Statistics (rolling 24 hours)
GET `https://api.decenza.coffee/v1/stats`

### Recent Shots
GET `https://api.decenza.coffee/v1/shots/recent?limit=50`

### Screensaver API (cached, high-traffic)
GET `https://decenza.coffee/api/shots-latest.json`

Lightweight endpoint for screensavers with thousands of concurrent viewers. Returns minimal data (coords + age) updated every minute.

See [docs/api.md](docs/api.md) for full documentation.
See [docs/screensaver-api.md](docs/screensaver-api.md) for screensaver integration.

## Architecture

See [docs/architecture.md](docs/architecture.md) for detailed architecture.

## License

MIT
