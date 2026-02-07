# API Gateway - HTTP API

resource "aws_apigatewayv2_api" "http" {
  name          = "${local.project_name}-http-api"
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins = ["*"]
    allow_methods = ["GET", "POST", "DELETE", "OPTIONS"]
    allow_headers = ["Content-Type", "x-api-key", "X-Device-Id"]
    max_age       = 86400
  }

  tags = local.common_tags
}

resource "aws_apigatewayv2_stage" "http" {
  api_id      = aws_apigatewayv2_api.http.id
  name        = "$default"
  auto_deploy = true

  default_route_settings {
    throttling_rate_limit  = var.api_throttle_rate
    throttling_burst_limit = var.api_throttle_burst
  }

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api_access.arn
    format = jsonencode({
      requestId        = "$context.requestId"
      ip               = "$context.identity.sourceIp"
      requestTime      = "$context.requestTime"
      httpMethod       = "$context.httpMethod"
      routeKey         = "$context.routeKey"
      status           = "$context.status"
      responseLength   = "$context.responseLength"
      integrationError = "$context.integrationErrorMessage"
    })
  }

  tags = local.common_tags
}

resource "aws_cloudwatch_log_group" "api_access" {
  name              = "/aws/apigateway/${local.project_name}-http-api"
  retention_in_days = 14
  tags              = local.common_tags
}

# POST /v1/shots
resource "aws_apigatewayv2_integration" "ingest_shot" {
  api_id                 = aws_apigatewayv2_api.http.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.ingest_shot.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "post_shots" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "POST /v1/shots"
  target             = "integrations/${aws_apigatewayv2_integration.ingest_shot.id}"
  authorization_type = "NONE"
}

resource "aws_lambda_permission" "ingest_shot" {
  statement_id  = "AllowAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.ingest_shot.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.http.execution_arn}/*/*"
}

# GET /v1/stats
resource "aws_apigatewayv2_integration" "get_stats" {
  api_id                 = aws_apigatewayv2_api.http.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.get_stats.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "get_stats" {
  api_id    = aws_apigatewayv2_api.http.id
  route_key = "GET /v1/stats"
  target    = "integrations/${aws_apigatewayv2_integration.get_stats.id}"
}

resource "aws_lambda_permission" "get_stats" {
  statement_id  = "AllowAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.get_stats.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.http.execution_arn}/*/*"
}

# GET /v1/shots/recent
resource "aws_apigatewayv2_integration" "get_recent_shots" {
  api_id                 = aws_apigatewayv2_api.http.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.get_recent_shots.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "get_recent_shots" {
  api_id    = aws_apigatewayv2_api.http.id
  route_key = "GET /v1/shots/recent"
  target    = "integrations/${aws_apigatewayv2_integration.get_recent_shots.id}"
}

resource "aws_lambda_permission" "get_recent_shots" {
  statement_id  = "AllowAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.get_recent_shots.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.http.execution_arn}/*/*"
}

# POST /v1/crash-report
resource "aws_apigatewayv2_integration" "crash_report" {
  api_id                 = aws_apigatewayv2_api.http.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.crash_report.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "post_crash_report" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "POST /v1/crash-report"
  target             = "integrations/${aws_apigatewayv2_integration.crash_report.id}"
  authorization_type = "NONE"
}

resource "aws_lambda_permission" "crash_report" {
  statement_id  = "AllowAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.crash_report.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.http.execution_arn}/*/*"
}

# POST /v1/library/entries
resource "aws_apigatewayv2_integration" "library_create" {
  api_id                 = aws_apigatewayv2_api.http.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.library_create.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "post_library_entries" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "POST /v1/library/entries"
  target             = "integrations/${aws_apigatewayv2_integration.library_create.id}"
  authorization_type = "NONE"
}

resource "aws_lambda_permission" "library_create" {
  statement_id  = "AllowAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.library_create.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.http.execution_arn}/*/*"
}

# GET /v1/library/entries
resource "aws_apigatewayv2_integration" "library_list" {
  api_id                 = aws_apigatewayv2_api.http.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.library_list.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "get_library_entries" {
  api_id    = aws_apigatewayv2_api.http.id
  route_key = "GET /v1/library/entries"
  target    = "integrations/${aws_apigatewayv2_integration.library_list.id}"
}

resource "aws_lambda_permission" "library_list" {
  statement_id  = "AllowAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.library_list.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.http.execution_arn}/*/*"
}

# GET /v1/library/entries/{id}
resource "aws_apigatewayv2_integration" "library_get" {
  api_id                 = aws_apigatewayv2_api.http.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.library_get.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "get_library_entry" {
  api_id    = aws_apigatewayv2_api.http.id
  route_key = "GET /v1/library/entries/{id}"
  target    = "integrations/${aws_apigatewayv2_integration.library_get.id}"
}

resource "aws_lambda_permission" "library_get" {
  statement_id  = "AllowAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.library_get.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.http.execution_arn}/*/*"
}

# POST /v1/library/entries/{id}/download
resource "aws_apigatewayv2_integration" "library_download" {
  api_id                 = aws_apigatewayv2_api.http.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.library_download.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "post_library_download" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "POST /v1/library/entries/{id}/download"
  target             = "integrations/${aws_apigatewayv2_integration.library_download.id}"
  authorization_type = "NONE"
}

resource "aws_lambda_permission" "library_download" {
  statement_id  = "AllowAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.library_download.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.http.execution_arn}/*/*"
}

# DELETE /v1/library/entries/{id}
resource "aws_apigatewayv2_integration" "library_delete" {
  api_id                 = aws_apigatewayv2_api.http.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.library_delete.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "delete_library_entry" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "DELETE /v1/library/entries/{id}"
  target             = "integrations/${aws_apigatewayv2_integration.library_delete.id}"
  authorization_type = "NONE"
}

resource "aws_lambda_permission" "library_delete" {
  statement_id  = "AllowAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.library_delete.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.http.execution_arn}/*/*"
}

# POST /v1/library/entries/{id}/flag
resource "aws_apigatewayv2_integration" "library_flag" {
  api_id                 = aws_apigatewayv2_api.http.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.library_flag.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "post_library_flag" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "POST /v1/library/entries/{id}/flag"
  target             = "integrations/${aws_apigatewayv2_integration.library_flag.id}"
  authorization_type = "NONE"
}

resource "aws_lambda_permission" "library_flag" {
  statement_id  = "AllowAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.library_flag.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.http.execution_arn}/*/*"
}


# API Gateway - WebSocket API

resource "aws_apigatewayv2_api" "websocket" {
  name                       = "${local.project_name}-ws-api"
  protocol_type              = "WEBSOCKET"
  route_selection_expression = "$request.body.action"

  tags = local.common_tags
}

resource "aws_apigatewayv2_stage" "websocket" {
  api_id      = aws_apigatewayv2_api.websocket.id
  name        = "prod"
  auto_deploy = true

  default_route_settings {
    throttling_rate_limit  = 100
    throttling_burst_limit = 200
  }

  tags = local.common_tags
}

# $connect route
resource "aws_apigatewayv2_integration" "ws_connect" {
  api_id           = aws_apigatewayv2_api.websocket.id
  integration_type = "AWS_PROXY"
  integration_uri  = aws_lambda_function.ws_connect.invoke_arn
}

resource "aws_apigatewayv2_route" "ws_connect" {
  api_id    = aws_apigatewayv2_api.websocket.id
  route_key = "$connect"
  target    = "integrations/${aws_apigatewayv2_integration.ws_connect.id}"
}

resource "aws_lambda_permission" "ws_connect" {
  statement_id  = "AllowAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.ws_connect.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.websocket.execution_arn}/*/*"
}

# $disconnect route
resource "aws_apigatewayv2_integration" "ws_disconnect" {
  api_id           = aws_apigatewayv2_api.websocket.id
  integration_type = "AWS_PROXY"
  integration_uri  = aws_lambda_function.ws_disconnect.invoke_arn
}

resource "aws_apigatewayv2_route" "ws_disconnect" {
  api_id    = aws_apigatewayv2_api.websocket.id
  route_key = "$disconnect"
  target    = "integrations/${aws_apigatewayv2_integration.ws_disconnect.id}"
}

resource "aws_lambda_permission" "ws_disconnect" {
  statement_id  = "AllowAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.ws_disconnect.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.websocket.execution_arn}/*/*"
}

# $default route (handles all messages)
resource "aws_apigatewayv2_integration" "ws_message" {
  api_id           = aws_apigatewayv2_api.websocket.id
  integration_type = "AWS_PROXY"
  integration_uri  = aws_lambda_function.ws_message.invoke_arn
}

resource "aws_apigatewayv2_route" "ws_default" {
  api_id    = aws_apigatewayv2_api.websocket.id
  route_key = "$default"
  target    = "integrations/${aws_apigatewayv2_integration.ws_message.id}"
}

resource "aws_lambda_permission" "ws_message" {
  statement_id  = "AllowAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.ws_message.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.websocket.execution_arn}/*/*"
}
