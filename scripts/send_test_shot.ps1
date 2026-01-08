<#
.SYNOPSIS
    Send a test shot event to the API

.PARAMETER ApiUrl
    API endpoint URL (e.g., https://api.decenza.coffee)

.PARAMETER ApiKey
    API key for authentication (optional for now)

.PARAMETER City
    City name (default: random)

.PARAMETER Profile
    Profile name (default: random)

.EXAMPLE
    .\send_test_shot.ps1 -ApiUrl "https://api.decenza.coffee"
    .\send_test_shot.ps1 -ApiUrl "https://api.decenza.coffee" -City "Copenhagen" -Profile "Classic Espresso"
#>

param(
    [Parameter(Mandatory=$true)]
    [string]$ApiUrl,

    [Parameter(Mandatory=$false)]
    [string]$ApiKey = "",

    [Parameter(Mandatory=$false)]
    [string]$City = "",

    [Parameter(Mandatory=$false)]
    [string]$Profile = ""
)

$Cities = @(
    @{ city = "New York"; country_code = "US" },
    @{ city = "San Francisco"; country_code = "US" },
    @{ city = "London"; country_code = "GB" },
    @{ city = "Paris"; country_code = "FR" },
    @{ city = "Berlin"; country_code = "DE" },
    @{ city = "Tokyo"; country_code = "JP" },
    @{ city = "Sydney"; country_code = "AU" },
    @{ city = "Copenhagen"; country_code = "DK" },
    @{ city = "Amsterdam"; country_code = "NL" },
    @{ city = "Milan"; country_code = "IT" }
)

$Profiles = @(
    "Classic Espresso",
    "Lungo",
    "Ristretto",
    "Filter 2.0",
    "Turbo",
    "Blooming Espresso",
    "Adaptive"
)

$Software = @(
    @{ name = "Decenza|DE1"; version = "1.2.3" },
    @{ name = "Visualizer"; version = "3.0.1" },
    @{ name = "Decent App"; version = "2.5.0" }
)

$Machines = @(
    "Decent DE1",
    "Decent DE1PRO",
    "Decent DE1XL",
    "Bengle"
)

# Select random values if not provided
if (-not $City) {
    $selectedCity = $Cities | Get-Random
} else {
    $selectedCity = @{ city = $City; country_code = "XX" }
}

if (-not $Profile) {
    $Profile = $Profiles | Get-Random
}

$selectedSoftware = $Software | Get-Random
$selectedMachine = $Machines | Get-Random

$Body = @{
    city = $selectedCity.city
    country_code = $selectedCity.country_code
    profile = $Profile
    software_name = $selectedSoftware.name
    software_version = $selectedSoftware.version
    machine_model = $selectedMachine
} | ConvertTo-Json

$Headers = @{
    "Content-Type" = "application/json"
}

if ($ApiKey) {
    $Headers["x-api-key"] = $ApiKey
}

$Endpoint = "$ApiUrl/v1/shots"

Write-Host "Sending shot event to: $Endpoint" -ForegroundColor Cyan
Write-Host "Body: $Body" -ForegroundColor Yellow

try {
    $Response = Invoke-RestMethod -Uri $Endpoint -Method Post -Body $Body -Headers $Headers
    Write-Host "`nResponse:" -ForegroundColor Green
    $Response | ConvertTo-Json | Write-Host
} catch {
    Write-Host "`nError: $_" -ForegroundColor Red
    if ($_.Exception.Response) {
        $Reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $ResponseBody = $Reader.ReadToEnd()
        Write-Host "Response body: $ResponseBody" -ForegroundColor Red
    }
}
