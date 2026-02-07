variable "aws_region" {
  description = "AWS region for resources"
  type        = string
  default     = "eu-north-1"
}

variable "aws_profile" {
  description = "AWS CLI profile to use"
  type        = string
  default     = "decenza"
}

variable "domain_name" {
  description = "Domain name for the website (e.g., decenza.coffee)"
  type        = string
}

variable "route53_zone_id" {
  description = "Route 53 hosted zone ID for the domain"
  type        = string
}

variable "environment" {
  description = "Environment name (prod, staging, dev)"
  type        = string
  default     = "prod"
}

variable "cors_origin" {
  description = "CORS allowed origin"
  type        = string
  default     = "*"
}

variable "raw_ttl_days" {
  description = "TTL for raw shot events in DynamoDB (days)"
  type        = number
  default     = 180
}

variable "api_throttle_rate" {
  description = "API Gateway throttle rate (requests per second)"
  type        = number
  default     = 100
}

variable "api_throttle_burst" {
  description = "API Gateway throttle burst"
  type        = number
  default     = 200
}

variable "github_pat" {
  description = "GitHub Personal Access Token for crash report issue creation"
  type        = string
  sensitive   = true
  default     = ""
}
