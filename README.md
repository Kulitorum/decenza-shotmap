# Decenza Shot Map

A real-time world map showing espresso shots pulled globally. Open to any espresso app or machine.

## Overview

- **Frontend**: React + TypeScript + MapLibre GL JS
- **Backend**: AWS Lambda + API Gateway + DynamoDB
- **Hosting**: S3 + CloudFront at https://decenza.coffee
- **Real-time**: WebSocket API for live shot pings

## Quick Start

### Prerequisites

- Node.js 20+
- AWS CLI configured with appropriate credentials
- Terraform 1.5+
- PowerShell (Windows) or Bash (Linux/Mac)

### Deploy Infrastructure

```bash
cd infra
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your values
terraform init
terraform apply
```

### Deploy Frontend

```powershell
# Windows
.\scripts\deploy_frontend.ps1

# Linux/Mac
./scripts/deploy_frontend.sh
```

### Test with a Shot Event

```powershell
# Windows
.\scripts\send_test_shot.ps1 -ApiUrl "https://api.decenza.coffee" -ApiKey "your-api-key"

# Linux/Mac
./scripts/send_test_shot.sh "https://api.decenza.coffee" "your-api-key"
```

## Project Structure

```
decenza.coffee/
├── frontend/          # React SPA
├── backend/           # Lambda functions
├── infra/             # Terraform IaC
├── scripts/           # Deploy & utility scripts
└── docs/              # Documentation
```

## API

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

See [docs/api.md](docs/api.md) for full documentation.

## Architecture

See [docs/architecture.md](docs/architecture.md) for detailed architecture.

## License

MIT
