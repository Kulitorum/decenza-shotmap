# Lambda Functions

# Lambda layer for shared dependencies (optional - using bundled approach instead)

# Ingest Shot Lambda
resource "aws_lambda_function" "ingest_shot" {
  function_name = "${local.project_name}-ingest-shot"
  role          = aws_iam_role.lambda_role.arn
  handler       = "ingestShot.handler"
  runtime       = "nodejs20.x"
  timeout       = 10
  memory_size   = 256

  filename         = "${path.module}/../backend/dist/ingestShot.zip"
  source_code_hash = filebase64sha256("${path.module}/../backend/dist/ingestShot.zip")

  environment {
    variables = {
      SHOTS_RAW_TABLE        = aws_dynamodb_table.shots_raw.name
      SHOTS_AGG_TABLE        = aws_dynamodb_table.shots_agg.name
      CONNECTIONS_TABLE      = aws_dynamodb_table.ws_connections.name
      CITIES_TABLE           = aws_dynamodb_table.cities.name
      IDEMPOTENCY_TABLE      = aws_dynamodb_table.idempotency.name
      RAW_TTL_DAYS           = var.raw_ttl_days
      CORS_ORIGIN            = var.cors_origin
      WEBSOCKET_API_ENDPOINT = "https://${aws_apigatewayv2_api.websocket.id}.execute-api.${var.aws_region}.amazonaws.com/${aws_apigatewayv2_stage.websocket.name}"
    }
  }

  tags = local.common_tags
}

# Get Stats Lambda
resource "aws_lambda_function" "get_stats" {
  function_name = "${local.project_name}-get-stats"
  role          = aws_iam_role.lambda_role.arn
  handler       = "getStats.handler"
  runtime       = "nodejs20.x"
  timeout       = 10
  memory_size   = 256

  filename         = "${path.module}/../backend/dist/getStats.zip"
  source_code_hash = filebase64sha256("${path.module}/../backend/dist/getStats.zip")

  environment {
    variables = {
      SHOTS_RAW_TABLE = aws_dynamodb_table.shots_raw.name
      SHOTS_AGG_TABLE = aws_dynamodb_table.shots_agg.name
      CORS_ORIGIN     = var.cors_origin
    }
  }

  tags = local.common_tags
}

# Get Recent Shots Lambda
resource "aws_lambda_function" "get_recent_shots" {
  function_name = "${local.project_name}-get-recent-shots"
  role          = aws_iam_role.lambda_role.arn
  handler       = "getRecentShots.handler"
  runtime       = "nodejs20.x"
  timeout       = 10
  memory_size   = 256

  filename         = "${path.module}/../backend/dist/getRecentShots.zip"
  source_code_hash = filebase64sha256("${path.module}/../backend/dist/getRecentShots.zip")

  environment {
    variables = {
      SHOTS_RAW_TABLE = aws_dynamodb_table.shots_raw.name
      CORS_ORIGIN     = var.cors_origin
    }
  }

  tags = local.common_tags
}

# WebSocket Connect Lambda
resource "aws_lambda_function" "ws_connect" {
  function_name = "${local.project_name}-ws-connect"
  role          = aws_iam_role.lambda_role.arn
  handler       = "wsConnect.handler"
  runtime       = "nodejs20.x"
  timeout       = 10
  memory_size   = 128

  filename         = "${path.module}/../backend/dist/wsConnect.zip"
  source_code_hash = filebase64sha256("${path.module}/../backend/dist/wsConnect.zip")

  environment {
    variables = {
      CONNECTIONS_TABLE = aws_dynamodb_table.ws_connections.name
    }
  }

  tags = local.common_tags
}

# WebSocket Disconnect Lambda
resource "aws_lambda_function" "ws_disconnect" {
  function_name = "${local.project_name}-ws-disconnect"
  role          = aws_iam_role.lambda_role.arn
  handler       = "wsDisconnect.handler"
  runtime       = "nodejs20.x"
  timeout       = 10
  memory_size   = 128

  filename         = "${path.module}/../backend/dist/wsDisconnect.zip"
  source_code_hash = filebase64sha256("${path.module}/../backend/dist/wsDisconnect.zip")

  environment {
    variables = {
      CONNECTIONS_TABLE = aws_dynamodb_table.ws_connections.name
    }
  }

  tags = local.common_tags
}

# WebSocket Message Lambda
resource "aws_lambda_function" "ws_message" {
  function_name = "${local.project_name}-ws-message"
  role          = aws_iam_role.lambda_role.arn
  handler       = "wsMessage.handler"
  runtime       = "nodejs20.x"
  timeout       = 10
  memory_size   = 128

  filename         = "${path.module}/../backend/dist/wsMessage.zip"
  source_code_hash = filebase64sha256("${path.module}/../backend/dist/wsMessage.zip")

  environment {
    variables = {
      CONNECTIONS_TABLE      = aws_dynamodb_table.ws_connections.name
      WEBSOCKET_API_ENDPOINT = "https://${aws_apigatewayv2_api.websocket.id}.execute-api.${var.aws_region}.amazonaws.com/${aws_apigatewayv2_stage.websocket.name}"
    }
  }

  tags = local.common_tags
}

# CloudWatch Log Groups
resource "aws_cloudwatch_log_group" "ingest_shot" {
  name              = "/aws/lambda/${aws_lambda_function.ingest_shot.function_name}"
  retention_in_days = 14
  tags              = local.common_tags
}

resource "aws_cloudwatch_log_group" "get_stats" {
  name              = "/aws/lambda/${aws_lambda_function.get_stats.function_name}"
  retention_in_days = 14
  tags              = local.common_tags
}

resource "aws_cloudwatch_log_group" "get_recent_shots" {
  name              = "/aws/lambda/${aws_lambda_function.get_recent_shots.function_name}"
  retention_in_days = 14
  tags              = local.common_tags
}

resource "aws_cloudwatch_log_group" "ws_connect" {
  name              = "/aws/lambda/${aws_lambda_function.ws_connect.function_name}"
  retention_in_days = 14
  tags              = local.common_tags
}

resource "aws_cloudwatch_log_group" "ws_disconnect" {
  name              = "/aws/lambda/${aws_lambda_function.ws_disconnect.function_name}"
  retention_in_days = 14
  tags              = local.common_tags
}

resource "aws_cloudwatch_log_group" "ws_message" {
  name              = "/aws/lambda/${aws_lambda_function.ws_message.function_name}"
  retention_in_days = 14
  tags              = local.common_tags
}

# Export Shots Lambda (for screensaver/cached endpoint)
resource "aws_lambda_function" "export_shots" {
  function_name = "${local.project_name}-export-shots"
  role          = aws_iam_role.lambda_role.arn
  handler       = "exportShots.handler"
  runtime       = "nodejs20.x"
  timeout       = 30
  memory_size   = 256

  filename         = "${path.module}/../backend/dist/exportShots.zip"
  source_code_hash = filebase64sha256("${path.module}/../backend/dist/exportShots.zip")

  environment {
    variables = {
      SHOTS_RAW_TABLE = aws_dynamodb_table.shots_raw.name
      WEBSITE_BUCKET  = aws_s3_bucket.website.id
    }
  }

  tags = local.common_tags
}

resource "aws_cloudwatch_log_group" "export_shots" {
  name              = "/aws/lambda/${aws_lambda_function.export_shots.function_name}"
  retention_in_days = 14
  tags              = local.common_tags
}

# EventBridge rule to trigger export every 30 seconds
resource "aws_cloudwatch_event_rule" "export_shots_schedule" {
  name                = "${local.project_name}-export-shots-schedule"
  description         = "Trigger shots export every 30 seconds"
  schedule_expression = "rate(1 minute)"
  tags                = local.common_tags
}

resource "aws_cloudwatch_event_target" "export_shots_target" {
  rule      = aws_cloudwatch_event_rule.export_shots_schedule.name
  target_id = "ExportShotsLambda"
  arn       = aws_lambda_function.export_shots.arn
}

resource "aws_lambda_permission" "allow_eventbridge" {
  statement_id  = "AllowEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.export_shots.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.export_shots_schedule.arn
}
