# GigTask - one-time database setup for Windows (PowerShell).
#
# Run from the repository root:
#   powershell -ExecutionPolicy Bypass -File scripts\setup.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\setup.ps1 -Reset     # wipe and start again
#
# Needs: Docker Desktop (running) and Python 3. psql / mongosh are NOT needed:
# the SQL and Mongo scripts run inside the database containers.

param([switch]$Reset)

# 'Continue': in Windows PowerShell 5.1, 'Stop' turns any stderr output from
# docker/pip (which they print even on success) into a fatal error. Every
# external command is checked explicitly instead.
$ErrorActionPreference = 'Continue'
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)   # pipe files to docker as UTF-8
Set-Location (Split-Path $PSScriptRoot -Parent)

function Step($text) { Write-Host "`n==> $text" -ForegroundColor Yellow }
function Fail($text) { Write-Host "`nERROR: $text" -ForegroundColor Red; exit 1 }
function Check($what) { if ($LASTEXITCODE -ne 0) { Fail "$what failed (exit code $LASTEXITCODE)." } }

# ---------------------------------------------------------------- prerequisites
Step 'Checking prerequisites'
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { Fail 'Docker is not installed. Install Docker Desktop.' }
docker info *> $null
if ($LASTEXITCODE -ne 0) { Fail 'Docker Desktop is not running. Start it, wait for "Engine running", then re-run.' }

$py = $null
foreach ($c in 'python', 'py') {
    if (Get-Command $c -ErrorAction SilentlyContinue) {
        & $c --version *> $null
        if ($LASTEXITCODE -eq 0) { $py = $c; break }
    }
}
if (-not $py) { Fail 'Python 3 not found. Install it from python.org and tick "Add python.exe to PATH".' }
Write-Host "   docker OK, python = $py"

# Another project's containers on our ports would make "docker compose up" fail.
$project = (Split-Path (Get-Location) -Leaf).ToLower()
$clash = docker ps --format '{{.Names}} {{.Ports}}' | Where-Object { ($_ -match ':5433->|:27018->') -and ($_ -notmatch "^$project-") }
if ($clash) {
    Fail ("Ports 5433/27018 are used by other containers:`n   $($clash -join "`n   ")`n" +
          "Stop them first, e.g. in that project's folder run:  docker compose down")
}

# ---------------------------------------------------------------- containers
Step 'Starting PostgreSQL and MongoDB containers'
docker compose up -d; Check 'docker compose up'

Write-Host '   waiting for databases to accept connections...'
$ready = $false
for ($i = 0; $i -lt 60; $i++) {
    docker compose exec -T postgres pg_isready -U postgres -d gigtask *> $null
    $pg = $LASTEXITCODE -eq 0
    docker compose exec -T mongo mongosh --quiet --eval "db.adminCommand('ping').ok" *> $null
    $mg = $LASTEXITCODE -eq 0
    if ($pg -and $mg) { $ready = $true; break }
    Start-Sleep -Seconds 2
}
if (-not $ready) { Fail 'Databases did not start within 2 minutes. Check: docker compose logs' }

# The seeders and the API connect from Windows through the published ports, so
# check those too (Docker Desktop's port forwarding can lag behind the container).
function Test-HostPort([int]$port) {
    $c = New-Object System.Net.Sockets.TcpClient
    try { $c.Connect('127.0.0.1', $port); return $true } catch { return $false } finally { $c.Close() }
}
$hostOk = $false
for ($i = 0; $i -lt 15; $i++) {
    if ((Test-HostPort 5433) -and (Test-HostPort 27018)) { $hostOk = $true; break }
    Start-Sleep -Seconds 2
}
if (-not $hostOk) {
    Fail ("The databases run, but Windows cannot reach localhost:5433 / 27018.`n" +
          "   Docker Desktop's port forwarding is stuck (common after stopping other containers on the same ports).`n" +
          "   Fix: docker compose down   then restart Docker Desktop (tray icon > Restart), then re-run this script.")
}

function Psql([string]$sql) {
    $out = docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -q -At -U postgres -d gigtask -c $sql
    Check "SQL: $sql"
    return $out
}
function PsqlFile([string]$path) {
    Write-Host "   $path"
    Get-Content $path -Raw | docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -q -U postgres -d gigtask
    Check $path
}
function MongoFile([string]$path) {
    Write-Host "   $path"
    Get-Content $path -Raw | docker compose exec -T mongo mongosh --quiet gigtask | Out-Null
    Check $path
}

# ---------------------------------------------------------------- reset / guard
if ($Reset) {
    Step 'Reset: dropping all PostgreSQL tables'
    Psql 'DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;' | Out-Null
}
if ((Psql "SELECT to_regclass('public.clients') IS NOT NULL") -eq 't') {
    if ([int](Psql 'SELECT COUNT(*) FROM clients') -gt 0) {
        Fail 'The database already has data. To start over run:  scripts\setup.ps1 -Reset'
    }
    Fail 'Tables exist from an earlier, unfinished run. Run:  scripts\setup.ps1 -Reset'
}

# ---------------------------------------------------------------- PostgreSQL
Step 'PostgreSQL schema (inherited 01-05)'
'01_schema_ddl', '02_indexes', '03_triggers_and_audit', '04_stored_procedures', '05_materialized_views' |
    ForEach-Object { PsqlFile "db\sql\$_.sql" }

Step 'UI support table (07, additive only - no inherited object is changed)'
PsqlFile 'db\sql\07_ui_support.sql'

Step 'Python packages'
& $py -m pip install --quiet --disable-pip-version-check -r db\data_generation\requirements.txt
if ($LASTEXITCODE -ne 0) {
    # The inherited file pins exact versions; one may have no build for this Python.
    # Install the same three packages unpinned instead (the file is not changed).
    Write-Host '   pinned versions failed; installing latest psycopg2-binary, pymongo, faker' -ForegroundColor Yellow
    & $py -m pip install --quiet --disable-pip-version-check psycopg2-binary pymongo faker; Check 'pip install'
}

$env:PGHOST = 'localhost'; $env:PGPORT = '5433'; $env:PGDATABASE = 'gigtask'
$env:PGUSER = 'postgres'; $env:PGPASSWORD = 'gigtask'
$env:MONGO_URI = 'mongodb://localhost:27018'; $env:MONGO_DB = 'gigtask'

Step 'Seeding PostgreSQL (1,000 clients, 2,000 freelancers, 50,000 contracts, 100,000 audit rows)'
& $py db\data_generation\postgres_seeder.py; Check 'postgres_seeder.py'

Step 'Refreshing the materialized view (it was created before the data existed)'
Psql "SELECT refresh_freelancer_lifetime_stats(); INSERT INTO mv_refresh_log (view_name, refresh_mode, started_at, finished_at) VALUES ('freelancer_lifetime_stats', 'CONCURRENT', now(), clock_timestamp());" | Out-Null

# ---------------------------------------------------------------- MongoDB
Step 'MongoDB collections and indexes'
docker compose exec -T mongo mongosh --quiet gigtask --eval 'db.dropDatabase()' | Out-Null   # 01 cannot be re-run on existing collections
MongoFile 'db\mongo\01_collections_and_indexes.js'

Step 'Seeding MongoDB (portfolios, 20,000 reviews, 500,000 location pings - a minute or two)'
& $py db\data_generation\mongo_seeder.py; Check 'mongo_seeder.py'

# ---------------------------------------------------------------- summary
Step 'Done'
Psql "SELECT 'clients=' || (SELECT COUNT(*) FROM clients) || '  freelancers=' || (SELECT COUNT(*) FROM freelancers) || '  contracts=' || (SELECT COUNT(*) FROM contracts) || '  audit rows=' || (SELECT COUNT(*) FROM wallet_audit_logs)"
Write-Host "Location pings expire 2 hours from now (TTL index); the map's 'Add fresh pings' button adds new ones." -ForegroundColor Cyan
Write-Host "`nNext:  powershell -ExecutionPolicy Bypass -File scripts\start.ps1" -ForegroundColor Green
