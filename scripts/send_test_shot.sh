#!/bin/bash
set -e

# Send a test shot event to the API
# Usage: ./send_test_shot.sh <api_url> [api_key] [city] [profile]

API_URL="${1:?API URL required}"
API_KEY="${2:-}"
CITY="${3:-}"
PROFILE="${4:-}"

# Sample data
CITIES=(
    '{"city": "New York", "country_code": "US"}'
    '{"city": "San Francisco", "country_code": "US"}'
    '{"city": "London", "country_code": "GB"}'
    '{"city": "Paris", "country_code": "FR"}'
    '{"city": "Berlin", "country_code": "DE"}'
    '{"city": "Tokyo", "country_code": "JP"}'
    '{"city": "Sydney", "country_code": "AU"}'
    '{"city": "Copenhagen", "country_code": "DK"}'
    '{"city": "Amsterdam", "country_code": "NL"}'
    '{"city": "Milan", "country_code": "IT"}'
)

PROFILES=(
    "Classic Espresso"
    "Lungo"
    "Ristretto"
    "Filter 2.0"
    "Turbo"
    "Blooming Espresso"
    "Adaptive"
)

SOFTWARE=(
    '{"name": "Decenza|DE1", "version": "1.2.3"}'
    '{"name": "Visualizer", "version": "3.0.1"}'
    '{"name": "Decent App", "version": "2.5.0"}'
)

MACHINES=(
    "Decent DE1"
    "Decent DE1PRO"
    "Decent DE1XL"
    "Bengle"
)

# Select random values
if [ -z "$CITY" ]; then
    CITY_DATA=${CITIES[$RANDOM % ${#CITIES[@]}]}
    CITY_NAME=$(echo "$CITY_DATA" | jq -r '.city')
    COUNTRY_CODE=$(echo "$CITY_DATA" | jq -r '.country_code')
else
    CITY_NAME="$CITY"
    COUNTRY_CODE="XX"
fi

if [ -z "$PROFILE" ]; then
    PROFILE=${PROFILES[$RANDOM % ${#PROFILES[@]}]}
fi

SOFTWARE_DATA=${SOFTWARE[$RANDOM % ${#SOFTWARE[@]}]}
SOFTWARE_NAME=$(echo "$SOFTWARE_DATA" | jq -r '.name')
SOFTWARE_VERSION=$(echo "$SOFTWARE_DATA" | jq -r '.version')
MACHINE=${MACHINES[$RANDOM % ${#MACHINES[@]}]}

# Build request body
BODY=$(jq -n \
    --arg city "$CITY_NAME" \
    --arg cc "$COUNTRY_CODE" \
    --arg profile "$PROFILE" \
    --arg sw_name "$SOFTWARE_NAME" \
    --arg sw_version "$SOFTWARE_VERSION" \
    --arg machine "$MACHINE" \
    '{
        city: $city,
        country_code: $cc,
        profile: $profile,
        software_name: $sw_name,
        software_version: $sw_version,
        machine_model: $machine
    }')

ENDPOINT="$API_URL/v1/shots"

echo "Sending shot event to: $ENDPOINT"
echo "Body: $BODY"

HEADERS=(-H "Content-Type: application/json")
if [ -n "$API_KEY" ]; then
    HEADERS+=(-H "x-api-key: $API_KEY")
fi

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$ENDPOINT" \
    "${HEADERS[@]}" \
    -d "$BODY")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

echo ""
echo "HTTP Status: $HTTP_CODE"
echo "Response: $BODY"
