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

# Crash Report Lambda
resource "aws_lambda_function" "crash_report" {
  function_name = "${local.project_name}-crash-report"
  role          = aws_iam_role.lambda_role.arn
  handler       = "crashReport.handler"
  runtime       = "nodejs20.x"
  timeout       = 30
  memory_size   = 256

  filename         = "${path.module}/../backend/dist/crashReport.zip"
  source_code_hash = filebase64sha256("${path.module}/../backend/dist/crashReport.zip")

  environment {
    variables = {
      RATE_LIMIT_TABLE = aws_dynamodb_table.rate_limit.name
      CORS_ORIGIN      = var.cors_origin
      GITHUB_PAT       = var.github_pat
    }
  }

  tags = local.common_tags
}

resource "aws_cloudwatch_log_group" "crash_report" {
  name              = "/aws/lambda/${aws_lambda_function.crash_report.function_name}"
  retention_in_days = 14
  tags              = local.common_tags
}

# ============ Library Lambdas ============

# Library Create Lambda
resource "aws_lambda_function" "library_create" {
  function_name = "${local.project_name}-library-create"
  role          = aws_iam_role.lambda_role.arn
  handler       = "libraryCreate.handler"
  runtime       = "nodejs20.x"
  timeout       = 10
  memory_size   = 256

  filename         = "${path.module}/../backend/dist/libraryCreate.zip"
  source_code_hash = filebase64sha256("${path.module}/../backend/dist/libraryCreate.zip")

  environment {
    variables = {
      LIBRARY_TABLE        = aws_dynamodb_table.library.name
      RATE_LIMIT_TABLE     = aws_dynamodb_table.rate_limit.name
      CORS_ORIGIN          = var.cors_origin
      WEBSITE_BUCKET       = aws_s3_bucket.website.id
      THUMBNAIL_URL_PREFIX = "https://${var.domain_name}/library/thumbnails"
    }
  }

  tags = local.common_tags
}

resource "aws_cloudwatch_log_group" "library_create" {
  name              = "/aws/lambda/${aws_lambda_function.library_create.function_name}"
  retention_in_days = 14
  tags              = local.common_tags
}

# Library List Lambda
resource "aws_lambda_function" "library_list" {
  function_name = "${local.project_name}-library-list"
  role          = aws_iam_role.lambda_role.arn
  handler       = "libraryList.handler"
  runtime       = "nodejs20.x"
  timeout       = 10
  memory_size   = 256

  filename         = "${path.module}/../backend/dist/libraryList.zip"
  source_code_hash = filebase64sha256("${path.module}/../backend/dist/libraryList.zip")

  environment {
    variables = {
      LIBRARY_TABLE        = aws_dynamodb_table.library.name
      CORS_ORIGIN          = var.cors_origin
      THUMBNAIL_URL_PREFIX = "https://${var.domain_name}/library/thumbnails"
    }
  }

  tags = local.common_tags
}

resource "aws_cloudwatch_log_group" "library_list" {
  name              = "/aws/lambda/${aws_lambda_function.library_list.function_name}"
  retention_in_days = 14
  tags              = local.common_tags
}

# Library Get Lambda
resource "aws_lambda_function" "library_get" {
  function_name = "${local.project_name}-library-get"
  role          = aws_iam_role.lambda_role.arn
  handler       = "libraryGet.handler"
  runtime       = "nodejs20.x"
  timeout       = 10
  memory_size   = 256

  filename         = "${path.module}/../backend/dist/libraryGet.zip"
  source_code_hash = filebase64sha256("${path.module}/../backend/dist/libraryGet.zip")

  environment {
    variables = {
      LIBRARY_TABLE        = aws_dynamodb_table.library.name
      CORS_ORIGIN          = var.cors_origin
      THUMBNAIL_URL_PREFIX = "https://${var.domain_name}/library/thumbnails"
    }
  }

  tags = local.common_tags
}

resource "aws_cloudwatch_log_group" "library_get" {
  name              = "/aws/lambda/${aws_lambda_function.library_get.function_name}"
  retention_in_days = 14
  tags              = local.common_tags
}

# Library Download Lambda
resource "aws_lambda_function" "library_download" {
  function_name = "${local.project_name}-library-download"
  role          = aws_iam_role.lambda_role.arn
  handler       = "libraryDownload.handler"
  runtime       = "nodejs20.x"
  timeout       = 10
  memory_size   = 256

  filename         = "${path.module}/../backend/dist/libraryDownload.zip"
  source_code_hash = filebase64sha256("${path.module}/../backend/dist/libraryDownload.zip")

  environment {
    variables = {
      LIBRARY_TABLE = aws_dynamodb_table.library.name
      CORS_ORIGIN   = var.cors_origin
    }
  }

  tags = local.common_tags
}

resource "aws_cloudwatch_log_group" "library_download" {
  name              = "/aws/lambda/${aws_lambda_function.library_download.function_name}"
  retention_in_days = 14
  tags              = local.common_tags
}

# Library Delete Lambda
resource "aws_lambda_function" "library_delete" {
  function_name = "${local.project_name}-library-delete"
  role          = aws_iam_role.lambda_role.arn
  handler       = "libraryDelete.handler"
  runtime       = "nodejs20.x"
  timeout       = 10
  memory_size   = 256

  filename         = "${path.module}/../backend/dist/libraryDelete.zip"
  source_code_hash = filebase64sha256("${path.module}/../backend/dist/libraryDelete.zip")

  environment {
    variables = {
      LIBRARY_TABLE  = aws_dynamodb_table.library.name
      WEBSITE_BUCKET = aws_s3_bucket.website.id
      CORS_ORIGIN    = var.cors_origin
    }
  }

  tags = local.common_tags
}

resource "aws_cloudwatch_log_group" "library_delete" {
  name              = "/aws/lambda/${aws_lambda_function.library_delete.function_name}"
  retention_in_days = 14
  tags              = local.common_tags
}

# Library Flag Lambda
resource "aws_lambda_function" "library_flag" {
  function_name = "${local.project_name}-library-flag"
  role          = aws_iam_role.lambda_role.arn
  handler       = "libraryFlag.handler"
  runtime       = "nodejs20.x"
  timeout       = 10
  memory_size   = 256

  filename         = "${path.module}/../backend/dist/libraryFlag.zip"
  source_code_hash = filebase64sha256("${path.module}/../backend/dist/libraryFlag.zip")

  environment {
    variables = {
      LIBRARY_TABLE    = aws_dynamodb_table.library.name
      RATE_LIMIT_TABLE = aws_dynamodb_table.rate_limit.name
      CORS_ORIGIN      = var.cors_origin
    }
  }

  tags = local.common_tags
}

resource "aws_cloudwatch_log_group" "library_flag" {
  name              = "/aws/lambda/${aws_lambda_function.library_flag.function_name}"
  retention_in_days = 14
  tags              = local.common_tags
}

# Library Thumbnail Lambda
resource "aws_lambda_function" "library_thumbnail" {
  function_name = "${local.project_name}-library-thumbnail"
  role          = aws_iam_role.lambda_role.arn
  handler       = "libraryThumbnail.handler"
  runtime       = "nodejs20.x"
  timeout       = 30
  memory_size   = 256

  filename         = "${path.module}/../backend/dist/libraryThumbnail.zip"
  source_code_hash = filebase64sha256("${path.module}/../backend/dist/libraryThumbnail.zip")

  environment {
    variables = {
      LIBRARY_TABLE        = aws_dynamodb_table.library.name
      WEBSITE_BUCKET       = aws_s3_bucket.website.id
      THUMBNAIL_URL_PREFIX = "https://${var.domain_name}/library/thumbnails"
      CORS_ORIGIN          = var.cors_origin
    }
  }

  tags = local.common_tags
}

resource "aws_cloudwatch_log_group" "library_thumbnail" {
  name              = "/aws/lambda/${aws_lambda_function.library_thumbnail.function_name}"
  retention_in_days = 14
  tags              = local.common_tags
}
