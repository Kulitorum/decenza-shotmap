# Outputs

output "website_url" {
  description = "Website URL"
  value       = "https://${local.domain_name}"
}

output "api_url" {
  description = "API endpoint URL"
  value       = "https://${local.api_domain}"
}

output "ws_url" {
  description = "WebSocket endpoint URL"
  value       = "wss://${local.ws_domain}"
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID (for cache invalidation)"
  value       = aws_cloudfront_distribution.website.id
}

output "s3_bucket_name" {
  description = "S3 bucket name for website content"
  value       = aws_s3_bucket.website.bucket
}

output "dynamodb_tables" {
  description = "DynamoDB table names"
  value = {
    shots_raw      = aws_dynamodb_table.shots_raw.name
    shots_agg      = aws_dynamodb_table.shots_agg.name
    ws_connections = aws_dynamodb_table.ws_connections.name
    cities         = aws_dynamodb_table.cities.name
    idempotency    = aws_dynamodb_table.idempotency.name
  }
}

output "lambda_functions" {
  description = "Lambda function names"
  value = {
    ingest_shot      = aws_lambda_function.ingest_shot.function_name
    get_stats        = aws_lambda_function.get_stats.function_name
    get_recent_shots = aws_lambda_function.get_recent_shots.function_name
    ws_connect       = aws_lambda_function.ws_connect.function_name
    ws_disconnect    = aws_lambda_function.ws_disconnect.function_name
    ws_message       = aws_lambda_function.ws_message.function_name
  }
}

output "api_gateway_ids" {
  description = "API Gateway IDs"
  value = {
    http_api = aws_apigatewayv2_api.http.id
    ws_api   = aws_apigatewayv2_api.websocket.id
  }
}
