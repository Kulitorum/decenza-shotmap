terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# Default provider (primary region)
provider "aws" {
  region  = var.aws_region
  profile = var.aws_profile
}

# Provider for us-east-1 (required for CloudFront ACM certificates)
provider "aws" {
  alias   = "us_east_1"
  region  = "us-east-1"
  profile = var.aws_profile
}

# Data sources
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# Locals
locals {
  project_name = "decenza-shotmap"
  domain_name  = var.domain_name
  api_domain   = "api.${var.domain_name}"
  ws_domain    = "ws.${var.domain_name}"

  common_tags = {
    Project     = local.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}
