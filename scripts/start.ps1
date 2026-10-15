# GigTask - start the API and the web app on Windows.
#
#   powershell -ExecutionPolicy Bypass -File scripts\start.ps1
#
# Opens two PowerShell windows (API on :4000, web on :5173) and the browser.
# Uses npm.cmd, not npm: the new windows run with the normal execution policy,
# which blocks npm.ps1 on many Windows machines.
# Run scripts\setup.ps1 once before the first start.

# 'Continue': in Windows PowerShell 5.1, 'Stop' turns any stderr output from
# docker/npm (which they print even on success) into a fatal error.
$ErrorActionPreference = 'Continue'
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

function Fail($text) { Write-Host "ERROR: $text" -ForegroundColor Red; exit 1 }

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Fail 'Node.js is not installed. Install the LTS version from nodejs.org.' }
$major = [int]((node --version).TrimStart('v').Split('.')[0])
if ($major -lt 20) { Fail "Node.js 20 or newer is required (found $(node --version))." }

docker info *> $null
if ($LASTEXITCODE -ne 0) { Fail 'Docker Desktop is not running. Start it first.' }
docker compose up -d | Out-Null

foreach ($dir in 'api', 'web') {
    if (-not (Test-Path "$root\$dir\node_modules")) {
        Write-Host "Installing $dir packages (first run only)..." -ForegroundColor Yellow
        Push-Location "$root\$dir"
        npm.cmd install
        if ($LASTEXITCODE -ne 0) { Pop-Location; Fail "npm install in $dir failed." }
        Pop-Location
    }
}
if (-not (Test-Path "$root\api\.env")) { Copy-Item "$root\api\.env.example" "$root\api\.env" }

Start-Process powershell -ArgumentList '-NoExit', '-Command', "Set-Location '$root\api'; `$host.UI.RawUI.WindowTitle='GigTask API'; npm.cmd start"
Start-Process powershell -ArgumentList '-NoExit', '-Command', "Set-Location '$root\web'; `$host.UI.RawUI.WindowTitle='GigTask web'; npm.cmd run dev"

Write-Host 'Waiting for the web app...'
for ($i = 0; $i -lt 60; $i++) {
    try { Invoke-WebRequest -UseBasicParsing http://localhost:5173 -TimeoutSec 2 -ErrorAction Stop | Out-Null; break } catch { Start-Sleep -Seconds 1 }
}
Start-Process 'http://localhost:5173'
Write-Host 'GigTask is running. Close the two new windows to stop it.' -ForegroundColor Green
