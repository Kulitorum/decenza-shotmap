# DynamoDB Tables

# Raw shots table - stores individual shot events
resource "aws_dynamodb_table" "shots_raw" {
  name         = "${local.project_name}-shots-raw"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  tags = local.common_tags
}

# Aggregates table - stores daily counts by city/profile
resource "aws_dynamodb_table" "shots_agg" {
  name         = "${local.project_name}-shots-agg"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }

  tags = local.common_tags
}

# WebSocket connections table
resource "aws_dynamodb_table" "ws_connections" {
  name         = "${local.project_name}-ws-connections"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "connection_id"

  attribute {
    name = "connection_id"
    type = "S"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  tags = local.common_tags
}

# Cities lookup table
resource "aws_dynamodb_table" "cities" {
  name         = "${local.project_name}-cities"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "city_lower"
  range_key    = "country_code"

  attribute {
    name = "city_lower"
    type = "S"
  }

  attribute {
    name = "country_code"
    type = "S"
  }

  tags = local.common_tags
}

# Idempotency keys table
resource "aws_dynamodb_table" "idempotency" {
  name         = "${local.project_name}-idempotency"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "idempotency_key"

  attribute {
    name = "idempotency_key"
    type = "S"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  tags = local.common_tags
}

# Rate limiting table
resource "aws_dynamodb_table" "rate_limit" {
  name         = "${local.project_name}-rate-limit"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"

  attribute {
    name = "pk"
    type = "S"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  tags = local.common_tags
}

# Library entries table - widget/layout sharing
resource "aws_dynamodb_table" "library" {
  name         = "${local.project_name}-library"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }

  attribute {
    name = "type"
    type = "S"
  }

  attribute {
    name = "deviceId"
    type = "S"
  }

  attribute {
    name = "createdAt"
    type = "S"
  }

  attribute {
    name = "dataHash"
    type = "S"
  }

  global_secondary_index {
    name            = "GSI1"
    hash_key        = "type"
    range_key       = "createdAt"
    projection_type = "ALL"
  }

  global_secondary_index {
    name            = "GSI2"
    hash_key        = "deviceId"
    range_key       = "createdAt"
    projection_type = "ALL"
  }

  global_secondary_index {
    name            = "GSI3"
    hash_key        = "dataHash"
    projection_type = "KEYS_ONLY"
  }

  tags = local.common_tags
}
