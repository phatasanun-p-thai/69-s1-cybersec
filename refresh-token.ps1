param()

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$envFile = Join-Path $root ".env"
$base = "http://localhost:$((Select-String -Path $envFile -Pattern '^APP_PORT=(\d+)').Matches[0].Groups[1].Value)"

$vars = @{}
Get-Content $envFile | ForEach-Object {
    if ($_ -match '^([A-Z_]+)=(.*)$') { $vars[$matches[1]] = $matches[2].Trim() }
}

$login = Invoke-RestMethod -Uri "$base/api/auth/local" -Method POST -ContentType "application/json" `
    -Body (@{ identifier = $vars["USER_IDENTIFIER"]; password = $vars["USER_PASSWORD"] } | ConvertTo-Json)

if (-not $login.jwt) { throw "login failed - check USER_IDENTIFIER / USER_PASSWORD in .env" }

$lines = Get-Content $envFile
$out = foreach ($line in $lines) {
    if ($line -match '^USER_TOKEN=') { "USER_TOKEN=$($login.jwt)" } else { $line }
}
if ($out -notmatch '^USER_TOKEN=') { $out += ""; $out += "USER_TOKEN=$($login.jwt)" }
$out | Set-Content -LiteralPath $envFile -Encoding UTF8

$check = Invoke-RestMethod -Uri "$base/api/users/me" -Headers @{ Authorization = "Bearer $($login.jwt)" }
Write-Output "USER_TOKEN updated in .env (user: $($check.username))"
