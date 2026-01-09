# Operations Guide

## Deployment

### Prerequisites

1. AWS CLI configured with appropriate credentials
2. Terraform 1.5+
3. Node.js 20+
4. Route 53 hosted zone for your domain

### Initial Setup

1. **Configure Terraform variables:**
   ```bash
   cd infra
   cp terraform.tfvars.example terraform.tfvars
   # Edit terraform.tfvars with your values
   ```

2. **Deploy infrastructure:**
   ```bash
   # Windows
   .\scripts\deploy_infra.ps1

   # Linux/Mac
   ./scripts/deploy_infra.sh
   ```

3. **Seed cities data:**
   ```bash
   cd backend
   npm ci
   npx tsx ../scripts/seed_cities.ts <cities_table_name> <region>
   ```

4. **Deploy frontend:**
   ```bash
   # Windows
   .\scripts\deploy_frontend.ps1

   # Linux/Mac
   ./scripts/deploy_frontend.sh
   ```

5. **Test:**
   ```bash
   # Windows
   .\scripts\send_test_shot.ps1 -ApiUrl "https://api.decenza.coffee"

   # Linux/Mac
   ./scripts/send_test_shot.sh "https://api.decenza.coffee"
   ```

### Updating

**Frontend only:**
```bash
./scripts/deploy_frontend.sh
```

**Backend/Infrastructure:**
```bash
./scripts/deploy_infra.sh
```

## Monitoring

### CloudWatch Logs

Log groups:
- `/aws/lambda/decenza-shotmap-ingest-shot`
- `/aws/lambda/decenza-shotmap-get-stats`
- `/aws/lambda/decenza-shotmap-get-recent-shots`
- `/aws/lambda/decenza-shotmap-export-shots`
- `/aws/lambda/decenza-shotmap-ws-connect`
- `/aws/lambda/decenza-shotmap-ws-disconnect`
- `/aws/lambda/decenza-shotmap-ws-message`
- `/aws/apigateway/decenza-shotmap-http-api`

**View recent logs:**
```bash
aws logs tail /aws/lambda/decenza-shotmap-ingest-shot --follow
```

**Search for errors:**
```bash
aws logs filter-log-events \
  --log-group-name /aws/lambda/decenza-shotmap-ingest-shot \
  --filter-pattern "ERROR"
```

### Key Metrics

**Lambda:**
- Invocations
- Duration
- Errors
- Throttles

**API Gateway:**
- 4XX errors
- 5XX errors
- Latency
- Count

**DynamoDB:**
- ConsumedReadCapacityUnits
- ConsumedWriteCapacityUnits
- ThrottledRequests

### CloudWatch Dashboard (Optional)

Create a dashboard with:
```bash
aws cloudwatch put-dashboard --dashboard-name "DecenzaShotMap" --dashboard-body '{
  "widgets": [
    {
      "type": "metric",
      "properties": {
        "title": "Lambda Invocations",
        "metrics": [
          ["AWS/Lambda", "Invocations", "FunctionName", "decenza-shotmap-ingest-shot"]
        ],
        "period": 300
      }
    }
  ]
}'
```

## Troubleshooting

### Common Issues

**1. City not resolving:**
- Check CloudWatch logs for "Unresolved city" warnings
- Add city to Cities DynamoDB table:
  ```bash
  aws dynamodb put-item --table-name decenza-shotmap-cities --item '{
    "city_lower": {"S": "newcity"},
    "country_code": {"S": "XX"},
    "city": {"S": "New City"},
    "lat": {"N": "40.0"},
    "lon": {"N": "-74.0"}
  }'
  ```

**2. WebSocket connections failing:**
- Check ws_connect Lambda logs
- Verify WebSocket API stage is deployed
- Check client firewall/proxy settings

**3. High latency:**
- Check Lambda cold starts
- Consider provisioned concurrency for critical functions
- Check DynamoDB consumed capacity

**4. 429 errors (rate limiting):**
- Increase API Gateway throttle limits
- Implement client-side retry with backoff

### DynamoDB Queries

**Get today's stats:**
```bash
aws dynamodb get-item \
  --table-name decenza-shotmap-shots-agg \
  --key '{"pk": {"S": "DAY#2024-01-01"}, "sk": {"S": "TOTAL"}}'
```

**List recent shots:**
```bash
aws dynamodb query \
  --table-name decenza-shotmap-shots-raw \
  --key-condition-expression "pk = :pk" \
  --expression-attribute-values '{":pk": {"S": "DAY#2024-01-01"}}' \
  --scan-index-forward false \
  --limit 10
```

**Count WebSocket connections:**
```bash
aws dynamodb scan \
  --table-name decenza-shotmap-ws-connections \
  --select COUNT
```

### Lambda Testing

**Invoke ingestShot locally:**
```bash
aws lambda invoke \
  --function-name decenza-shotmap-ingest-shot \
  --payload '{"body": "{\"city\":\"Test\",\"profile\":\"Test\",\"software_name\":\"Test\",\"software_version\":\"1.0\",\"machine_model\":\"Test\"}", "requestContext": {"http": {"method": "POST"}}}' \
  response.json
```

## Cost Management

### Cost Breakdown

Monitor costs in AWS Cost Explorer with tags:
- `Project: decenza-shotmap`
- `Environment: prod`

### Reducing Costs

1. **DynamoDB:**
   - Use on-demand billing (default)
   - Reduce raw event TTL
   - Enable auto-scaling if predictable traffic

2. **Lambda:**
   - Optimize memory allocation
   - Reduce timeout
   - Use Graviton2 (ARM) for ~20% cost reduction

3. **CloudFront:**
   - Use PriceClass_100 (US, Canada, Europe only)
   - Enable compression

4. **Logs:**
   - Reduce retention period
   - Filter out debug logs in production

### Budget Alerts

Set up budget alerts:
```bash
aws budgets create-budget --account-id <account-id> --budget '{
  "BudgetName": "DecenzaShotMap-Monthly",
  "BudgetType": "COST",
  "BudgetLimit": {"Amount": "15", "Unit": "USD"},
  "TimeUnit": "MONTHLY"
}' --notifications-with-subscribers '[{
  "Notification": {
    "NotificationType": "ACTUAL",
    "ComparisonOperator": "GREATER_THAN",
    "Threshold": 80,
    "ThresholdType": "PERCENTAGE"
  },
  "Subscribers": [{
    "SubscriptionType": "EMAIL",
    "Address": "your-email@example.com"
  }]
}]'
```

## Backup & Recovery

### DynamoDB

Point-in-time recovery is not enabled by default. Enable if needed:
```bash
aws dynamodb update-continuous-backups \
  --table-name decenza-shotmap-shots-agg \
  --point-in-time-recovery-specification PointInTimeRecoveryEnabled=true
```

### On-demand Backups

```bash
aws dynamodb create-backup \
  --table-name decenza-shotmap-shots-agg \
  --backup-name "shots-agg-$(date +%Y%m%d)"
```

## Scaling

### Expected Limits

Current configuration handles:
- ~5,000 shots/day
- ~1,000 concurrent WebSocket connections
- ~100 requests/second

### Scaling Up

1. **API Gateway:**
   - Increase throttle limits in terraform.tfvars
   - Request quota increase from AWS

2. **Lambda:**
   - Increase memory
   - Enable provisioned concurrency

3. **DynamoDB:**
   - Tables use on-demand (auto-scaling)
   - Consider provisioned capacity for predictable workloads

4. **WebSocket:**
   - Current limit: 1000 concurrent connections
   - Request quota increase from AWS if needed
