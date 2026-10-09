param(
    [string]$OutputDirectory = ".\\backups"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$fileName = "passport_scanner-$timestamp.dump"

New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null

$outputDirectoryFull = (Resolve-Path $OutputDirectory).Path
$outputPath = Join-Path $outputDirectoryFull $fileName
$containerPath = "/tmp/passport_scanner-backup.dump"

Write-Host "Starting PostgreSQL database..."
docker compose up -d database
if ($LASTEXITCODE -ne 0) {
    throw "Failed to start database container."
}

Write-Host "Creating PostgreSQL custom-format backup..."
docker compose exec -T database pg_dump -U passport_scanner -d passport_scanner -Fc -f $containerPath
if ($LASTEXITCODE -ne 0) {
    throw "pg_dump failed."
}

Write-Host "Copying backup to host..."
docker compose cp "database:$containerPath" $outputPath
if ($LASTEXITCODE -ne 0) {
    throw "Failed to copy backup from database container."
}

docker compose exec -T database rm -f $containerPath | Out-Null

$hash = (Get-FileHash -Algorithm SHA256 -Path $outputPath).Hash
$hashPath = "$outputPath.sha256.txt"
"$hash  $fileName" | Set-Content -Path $hashPath -Encoding ascii

Write-Host ""
Write-Host "Backup completed:"
Write-Host "  $outputPath"
Write-Host "SHA256:"
Write-Host "  $hash"
Write-Host ""
Write-Host "Keep this file private. It contains traveler and identity-document data."
