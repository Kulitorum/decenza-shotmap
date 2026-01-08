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
