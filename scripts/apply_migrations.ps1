param(
  [switch]$RunSmoke
)

# Applies all SQL migrations in db/migrations in name order. Optionally runs the smoke test.
# Requires psql on PATH and connection via either $env:DATABASE_URL or PG* env vars.

function Invoke-PsqlFile {
  param([string]$File)
  Write-Host "Applying: $File"
  if ($env:DATABASE_URL) {
    psql "$env:DATABASE_URL" -v ON_ERROR_STOP=1 -f "$File"
  } else {
    psql -v ON_ERROR_STOP=1 -f "$File"
  }
  if ($LASTEXITCODE -ne 0) { throw "psql failed for $File" }
}

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$proj = Resolve-Path (Join-Path $root "..")
$migrations = Get-ChildItem -Path (Join-Path $proj "db/migrations") -Filter *.sql | Sort-Object Name

if (-not $migrations) { throw "No migration files found in db/migrations" }

foreach ($m in $migrations) {
  Invoke-PsqlFile -File $m.FullName
}

if ($RunSmoke) {
  $smoke = Join-Path $proj "db/seed/dev_smoke_test.sql"
  if (Test-Path $smoke) {
    Write-Host "Running smoke test (transactional)..."
    Invoke-PsqlFile -File $smoke
  } else {
    Write-Warning "Smoke test file not found: $smoke"
  }
}
