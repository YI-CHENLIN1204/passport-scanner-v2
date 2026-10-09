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
$hashFile = "$backupFullPath.sha256.txt"
$containerPath = "/tmp/passport_scanner-restore.dump"

if (Test-Path -LiteralPath $hashFile -PathType Leaf) {
    Write-Host "Verifying SHA256 checksum..."
    $hashLine = (Get-Content -LiteralPath $hashFile -TotalCount 1).Trim()
    $expectedHash = ($hashLine -split "\s+")[0].ToUpperInvariant()
    $actualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $backupFullPath).Hash.ToUpperInvariant()

    if ([string]::IsNullOrWhiteSpace($expectedHash)) {
        throw "SHA256 file is empty or invalid: $hashFile"
    }

    if ($actualHash -ne $expectedHash) {
        throw "Backup SHA256 mismatch. Restore aborted before changing the database."
    }

    Write-Host "SHA256 verified."
}
else {
    Write-Warning "No SHA256 sidecar found. Archive integrity will still be checked with pg_restore --list."
}

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

Write-Host "Checking backup archive..."
docker compose exec -T database pg_restore --list $containerPath | Out-Null
if ($LASTEXITCODE -ne 0) {
    docker compose exec -T database rm -f $containerPath | Out-Null
    throw "Backup archive is not readable by pg_restore. Restore aborted before changing the database."
}

Write-Host "Backup archive is readable."

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
