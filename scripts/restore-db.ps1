param(
    [Parameter(Mandatory = $true)]
    [string]$BackupFile,

    [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $BackupFile -PathType Leaf)) {
    throw "Backup file not found: $BackupFile"
}

$backupFullPath = (Resolve-Path -LiteralPath $BackupFile).Path
$containerPath = "/tmp/passport_scanner-restore.dump"

if (-not $Force) {
    Write-Host ""
    Write-Host "WARNING: This will replace the current passport_scanner database."
    Write-Host "Backup file:"
    Write-Host "  $backupFullPath"
    Write-Host ""
    $confirmation = Read-Host "Type RESTORE to continue"

    if ($confirmation -ne "RESTORE") {
        Write-Host "Restore cancelled."
        exit 0
    }
}

Write-Host "Stopping application services..."
docker compose stop frontend backend
if ($LASTEXITCODE -ne 0) {
    throw "Failed to stop application services."
}

Write-Host "Starting PostgreSQL database..."
docker compose up -d database
if ($LASTEXITCODE -ne 0) {
    throw "Failed to start database container."
}

Write-Host "Copying backup into database container..."
docker compose cp $backupFullPath "database:$containerPath"
if ($LASTEXITCODE -ne 0) {
    throw "Failed to copy backup into database container."
}

Write-Host "Replacing database..."
docker compose exec -T database psql -U passport_scanner -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS passport_scanner WITH (FORCE);"
if ($LASTEXITCODE -ne 0) {
    throw "Failed to drop current database."
}

docker compose exec -T database psql -U passport_scanner -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE passport_scanner OWNER passport_scanner;"
if ($LASTEXITCODE -ne 0) {
    throw "Failed to create replacement database."
}

Write-Host "Restoring backup..."
docker compose exec -T database pg_restore -U passport_scanner -d passport_scanner --no-owner --exit-on-error $containerPath
if ($LASTEXITCODE -ne 0) {
    throw "pg_restore failed."
}

docker compose exec -T database rm -f $containerPath | Out-Null

Write-Host "Starting application..."
docker compose up -d --build
if ($LASTEXITCODE -ne 0) {
    throw "Database restored, but application rebuild/start failed."
}

Write-Host ""
Write-Host "Restore completed successfully."
