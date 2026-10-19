param(
    [int]$FrontendPort = 15173,
    [int]$BackendPort = 15080,
    [switch]$KeepStack,
    [switch]$SkipHostBuild
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$projectName = "passport-scanner-v2-acceptance"
$composeArgs = @("compose", "-p", $projectName)
$apiBase = "http://localhost:$BackendPort"
$frontendBase = "http://localhost:$FrontendPort"
$backupDirectory = Join-Path ([System.IO.Path]::GetTempPath()) "passport-scanner-v2-acceptance-backup"

$previousFrontendPort = $env:FRONTEND_PORT
$previousBackendPort = $env:BACKEND_PORT

function Assert-Equal {
    param(
        [Parameter(Mandatory = $true)]$Actual,
        [Parameter(Mandatory = $true)]$Expected,
        [Parameter(Mandatory = $true)][string]$Message
    )

    if ("$Actual" -ne "$Expected") {
        throw "$Message Expected='$Expected' Actual='$Actual'"
    }
}

function Assert-True {
    param(
        [Parameter(Mandatory = $true)][bool]$Condition,
        [Parameter(Mandatory = $true)][string]$Message
    )

    if (-not $Condition) {
        throw $Message
    }
}

function Invoke-Api {
    param(
        [Parameter(Mandatory = $true)][string]$Method,
        [Parameter(Mandatory = $true)][string]$Uri,
        $Body = $null
    )

    $parameters = @{
        Method = $Method
        Uri = $Uri
    }

    if ($null -ne $Body) {
        $parameters["ContentType"] = "application/json"
        $parameters["Body"] = $Body | ConvertTo-Json -Depth 20 -Compress
    }

    return Invoke-RestMethod @parameters
}

function Invoke-Psql {
    param(
        [Parameter(Mandatory = $true)][string]$Sql
    )

    $output = & docker @composeArgs exec -T database psql -U passport_scanner -d passport_scanner -Atc $Sql

    if ($LASTEXITCODE -ne 0) {
        throw "PostgreSQL command failed: $Sql"
    }

    return (($output | Out-String).Trim())
}

function Wait-HttpOk {
    param(
        [Parameter(Mandatory = $true)][string]$Uri,
        [int]$Attempts = 45
    )

    for ($i = 0; $i -lt $Attempts; $i++) {
        try {
            $response = Invoke-WebRequest -Uri $Uri -UseBasicParsing -TimeoutSec 5
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 300) {
                return
            }
        }
        catch {
        }

        Start-Sleep -Seconds 2
    }

    throw "Timed out waiting for $Uri"
}

function Get-StatusCode {
    param(
        [Parameter(Mandatory = $true)][string]$Uri,
        [string]$Method = "GET"
    )

    $status = & curl.exe -s -o NUL -w "%{http_code}" -X $Method $Uri
    if ($LASTEXITCODE -ne 0) {
        throw "curl.exe failed for $Method $Uri"
    }

    return "$status".Trim()
}

Set-Location $projectRoot
$env:FRONTEND_PORT = "$FrontendPort"
$env:BACKEND_PORT = "$BackendPort"

try {
    Write-Host "=== V2 launch acceptance: isolated local environment ==="
    Write-Host "Docker project: $projectName"
    Write-Host "Frontend: $frontendBase"
    Write-Host "Backend:  $apiBase"
    Write-Host ""

    if (-not $SkipHostBuild) {
        Write-Host "[1/8] Frontend OCR regression + V2 launch guards + build"
        Push-Location (Join-Path $projectRoot "frontend")
        try {
            npm.cmd run verify:v2
            if ($LASTEXITCODE -ne 0) {
                throw "Frontend verify:v2 failed."
            }
        }
        finally {
            Pop-Location
        }

        Write-Host "[2/8] Backend build"
        $backendProject = Join-Path $projectRoot "backend/PassportScanner.Api/PassportScanner.Api.csproj"
        dotnet build $backendProject
        if ($LASTEXITCODE -ne 0) {
            throw "Backend build failed."
        }
    }
    else {
        Write-Host "[1-2/8] Host builds skipped by request."
    }

    Write-Host "[3/8] Build and start isolated Docker stack"
    & docker @composeArgs up -d --build database backend frontend
    if ($LASTEXITCODE -ne 0) {
        throw "Isolated Docker stack failed to start."
    }

    Wait-HttpOk "$apiBase/api/health"
    Wait-HttpOk "$frontendBase/api/health"

    $storeStatus = Invoke-Api -Method GET -Uri "$apiBase/api/document-store/status"
    Assert-Equal -Actual $storeStatus.persistence -Expected "postgresql" -Message "Persistence must be PostgreSQL."

    $requiredTables = @(
        "document_versions",
        "scan_batches",
        "scan_items",
        "tour_member_documents",
        "tour_members",
        "tour_person_drafts",
        "tours",
        "training_samples",
        "travelers"
    )

    $tableRows = Invoke-Psql @"
SELECT table_name
FROM information_schema.tables
WHERE table_schema='public'
  AND table_name IN ('document_versions','scan_batches','scan_items','tour_member_documents','tour_members','tour_person_drafts','tours','training_samples','travelers')
ORDER BY table_name;
"@

    foreach ($table in $requiredTables) {
        Assert-True -Condition (($tableRows -split "\r?\n") -contains $table) -Message "Missing required table: $table"
    }

    Assert-Equal -Actual (Invoke-Psql "SELECT COUNT(*) FROM pg_constraint WHERE conname='fk_scan_items_saved_document_version';") -Expected "1" -Message "Saved-document FK missing."
    Assert-Equal -Actual (Invoke-Psql "SELECT COUNT(*) FROM pg_indexes WHERE schemaname='public' AND indexname='ux_document_versions_one_current_per_type' AND indexdef ILIKE '%WHERE%is_current%';") -Expected "1" -Message "Current-document uniqueness index missing."
    Assert-Equal -Actual (Invoke-Psql "SELECT COUNT(*) FROM (SELECT traveler_id, document_type FROM document_versions WHERE is_current=TRUE GROUP BY traveler_id, document_type HAVING COUNT(*) > 1) AS duplicated;") -Expected "0" -Message "Duplicate current document groups exist."

    Write-Host "[4/8] Synthetic batch -> review -> formal traveler/document flow"
    $tour = Invoke-Api -Method POST -Uri "$apiBase/api/tours" -Body @{
        tourName = "V2 Acceptance Tour"
        departureDate = "2099-10-10"
        returnDate = "2099-10-12"
        requiredDocumentTypes = @("PASSPORT", "TAIWAN_COMPATRIOT_PERMIT")
    }

    $passportBatch = Invoke-Api -Method POST -Uri "$apiBase/api/tours/$($tour.tourId)/scan-batches" -Body @{
        documentType = "PASSPORT"
    }
    $permitBatch = Invoke-Api -Method POST -Uri "$apiBase/api/tours/$($tour.tourId)/scan-batches" -Body @{
        documentType = "TAIWAN_COMPATRIOT_PERMIT"
    }

    $syntheticName = -join ([char]0x738B, [char]0x5C0F, [char]0x660E)
    $imageBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="

    $passportItem = Invoke-Api -Method POST -Uri "$apiBase/api/scan-batches/$($passportBatch.scanBatchId)/items" -Body @{
        originalFileName = "acceptance-passport.png"
        imageContentType = "image/png"
        imageBase64 = $imageBase64
        nameZh = $syntheticName
        nameZhOnDocument = $syntheticName
        nameEn = "WANG HSIAO MING"
        birthDate = "1990-01-15"
        gender = "M"
        nationality = "TWN"
        nationalIdNumber = $null
        documentNumber = "T12345678"
        issuingCountry = "TWN"
        expiryDate = "2035-12-31"
        ocrPayloadJson = "{}"
    }

    $permitItem = Invoke-Api -Method POST -Uri "$apiBase/api/scan-batches/$($permitBatch.scanBatchId)/items" -Body @{
        originalFileName = "acceptance-permit.png"
        imageContentType = "image/png"
        imageBase64 = $imageBase64
        nameZh = $syntheticName
        nameZhOnDocument = $syntheticName
        nameEn = ""
        birthDate = "1990-01-15"
        gender = "M"
        nationality = $null
        nationalIdNumber = $null
        documentNumber = "12345678"
        issuingCountry = $null
        expiryDate = "2035-12-31"
        ocrPayloadJson = '{"totalMs":250,"orientationAttempts":1,"fallbackUsed":false}'
    }

    $null = Invoke-Api -Method POST -Uri "$apiBase/api/scan-batches/$($passportBatch.scanBatchId)/complete" -Body @{
        attemptCount = 1
        failedCount = 0
    }
    $null = Invoke-Api -Method POST -Uri "$apiBase/api/scan-batches/$($permitBatch.scanBatchId)/complete" -Body @{
        attemptCount = 2
        failedCount = 1
    }

    $null = Invoke-Api -Method PUT -Uri "$apiBase/api/scan-items/$($permitItem.scanItemId)/review" -Body @{
        nameZh = $syntheticName
        nameZhOnDocument = $syntheticName
        nameEn = ""
        birthDate = "1990-01-15"
        gender = "M"
        nationality = $null
        nationalIdNumber = $null
        documentNumber = "12345678"
        issuingCountry = $null
        expiryDate = "2035-12-31"
        useForTraining = $true
    }

    $null = Invoke-Api -Method PUT -Uri "$apiBase/api/scan-items/$($passportItem.scanItemId)/review" -Body @{
        nameZh = $syntheticName
        nameZhOnDocument = $syntheticName
        nameEn = "WANG HSIAO MING"
        birthDate = "1990-01-15"
        gender = "M"
        nationality = "TWN"
        nationalIdNumber = $null
        documentNumber = "T12345678"
        issuingCountry = "TWN"
        expiryDate = "2035-12-31"
        useForTraining = $false
    }

    $detail = Invoke-Api -Method GET -Uri "$apiBase/api/tours/$($tour.tourId)"
    Assert-Equal -Actual (@($detail.members).Count) -Expected 1 -Message "The two reviewed documents should resolve to one traveler."
    Assert-Equal -Actual (@($detail.members[0].documents).Count) -Expected 2 -Message "The tour member should keep both document versions/types."

    $docTypes = @($detail.members[0].documents | ForEach-Object { $_.documentType })
    Assert-True -Condition ($docTypes -contains "PASSPORT") -Message "Reviewed passport missing from formal tour data."
    Assert-True -Condition ($docTypes -contains "TAIWAN_COMPATRIOT_PERMIT") -Message "Reviewed permit missing from formal tour data."

    $reviewQueue = Invoke-Api -Method GET -Uri "$apiBase/api/tours/$($tour.tourId)/review-queue"
    $queuePeople = @($reviewQueue | Where-Object { $null -ne $_ })
    Assert-Equal -Actual $queuePeople.Count -Expected 1 -Message "Reviewed traveler group must remain available for re-edit."
    $queueDocuments = @($queuePeople | ForEach-Object { $_.documents } | Where-Object { $null -ne $_ })
    Assert-Equal -Actual $queueDocuments.Count -Expected 2 -Message "Both reviewed scan records must remain in the review queue."
    $pendingDocuments = @($queueDocuments | Where-Object { $_.reviewStatus -eq "PENDING" })
    Assert-Equal -Actual $pendingDocuments.Count -Expected 0 -Message "No pending documents should remain after both reviews."
    $reviewedDocuments = @($queueDocuments | Where-Object { $_.reviewStatus -eq "REVIEWED" })
    Assert-Equal -Actual $reviewedDocuments.Count -Expected 2 -Message "Both scan records must be reviewed."

    $deleteStatus = Get-StatusCode -Method DELETE -Uri "$apiBase/api/scan-items/$($permitItem.scanItemId)"
    Assert-Equal -Actual $deleteStatus -Expected "400" -Message "Reviewed scan must not be directly deletable."

    Write-Host "[4/8] D-132 manual merge with equivalent name glyphs"
    # Use a separate synthetic cohort. The two names are different literal
    # Unicode spellings; the formal original document names must survive.
    $wenLiteral = -join ([char]0x6E29, [char]0x660E)
    $wenTraditional = -join ([char]0x6EAB, [char]0x660E)
    $reviewedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")

    $glyphTour = Invoke-Api -Method POST -Uri "$apiBase/api/tours" -Body @{
        tourName = "D132 Glyph Merge Acceptance"
        departureDate = "2099-11-10"
        returnDate = "2099-11-12"
        requiredDocumentTypes = @("PASSPORT", "TAIWAN_COMPATRIOT_PERMIT")
    }

    $glyphPassport = Invoke-Api -Method POST -Uri "$apiBase/api/passport-reviews?tourId=$($glyphTour.tourId)" -Body @{
        schemaVersion = 2
        documentType = "passport"
        chineseName = $wenLiteral
        englishName = "WEN MING"
        passportNumber = "T88776655"
        nationality = "TWN"
        issuingState = "TWN"
        birthDate = "1991-05-06"
        sex = "M"
        expiryDate = "2035-01-01"
        verification = @{
            passportNumberCheckDigit = $true
            birthDateCheckDigit = $true
            expiryDateCheckDigit = $true
            compositeCheckDigit = $true
        }
        reviewAssertions = @{
            chineseNameVisuallyConfirmed = $true
            englishNameVisuallyConfirmed = $true
        }
        ocr = @{
            engine = "paddleocr-ppocrv5"
            line2Validated = $true
            chineseNameSource = "name-field"
            chineseNameScore = 0.9
            chineseNameRomanizationStatus = "compatible"
            fallbackUsed = $false
            averageScore = 0.9
        }
        reviewedAt = $reviewedAt
    }

    $glyphPermit = Invoke-Api -Method POST -Uri "$apiBase/api/taiwan-compatriot-permit-reviews?tourId=$($glyphTour.tourId)" -Body @{
        schemaVersion = 1
        documentType = "taiwan-compatriot-permit"
        chineseName = $wenTraditional
        permitNumber = "87654320"
        birthDate = "1991-05-06"
        sex = "M"
        expiryDate = "2035-01-01"
        reviewAssertions = @{
            allFieldsVisuallyConfirmed = $true
        }
        ocr = @{
            engine = "paddleocr-ppocrv5"
            extractedFieldCount = 5
            averageScore = 0.9
        }
        reviewedAt = $reviewedAt
    }

    Assert-True -Condition ($glyphPassport.travelerId -ne $glyphPermit.travelerId) -Message "Variant-only identities must not trigger new automatic traveler merging."
    $glyphMerged = Invoke-Api -Method POST -Uri "$apiBase/api/travelers/$($glyphPassport.travelerId)/merge" -Body @{
        sourceTravelerId = $glyphPermit.travelerId
    }
    Assert-Equal -Actual $glyphMerged.traveler.travelerId -Expected $glyphPassport.travelerId -Message "Explicit equivalent-glyph merge must preserve target traveler."
    Assert-Equal -Actual (@($glyphMerged.documents).Count) -Expected 2 -Message "Explicit glyph merge must preserve both document versions."
    $glyphOriginals = @($glyphMerged.documents | ForEach-Object { $_.nameZhOnDocument })
    Assert-True -Condition ($glyphOriginals -contains $wenLiteral) -Message "Passport printed name must retain its original glyph."
    Assert-True -Condition ($glyphOriginals -contains $wenTraditional) -Message "Permit printed name must retain its original glyph."
    Assert-Equal -Actual (Get-StatusCode -Uri "$apiBase/api/travelers/$($glyphPermit.travelerId)") -Expected "404" -Message "Source traveler must not remain independently after confirmed merge."

    Write-Host "[5/8] Production photo retention preserves explicitly selected training copy"
    $trainingSampleId = Invoke-Psql "SELECT training_sample_id FROM training_samples WHERE source_scan_item_id='$($permitItem.scanItemId)';"
    Assert-True -Condition (-not [string]::IsNullOrWhiteSpace($trainingSampleId)) -Message "Training sample was not created."

    $productionBefore = Join-Path ([System.IO.Path]::GetTempPath()) "passport-scanner-production-before.png"
    $trainingAfter = Join-Path ([System.IO.Path]::GetTempPath()) "passport-scanner-training-after.png"

    Invoke-WebRequest -Uri "$apiBase/api/scan-items/$($permitItem.scanItemId)/image" -OutFile $productionBefore -UseBasicParsing
    Invoke-Psql "UPDATE scan_items SET delete_after = NOW() - INTERVAL '1 hour' WHERE scan_item_id='$($permitItem.scanItemId)';" | Out-Null

    & docker @composeArgs restart backend | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Backend restart failed during retention check."
    }

    Wait-HttpOk "$apiBase/api/health"

    $imageBytes = ""
    for ($i = 0; $i -lt 30; $i++) {
        $imageBytes = Invoke-Psql "SELECT octet_length(image_bytes) FROM scan_items WHERE scan_item_id='$($permitItem.scanItemId)';"
        if ($imageBytes -eq "0") {
            break
        }
        Start-Sleep -Seconds 2
    }

    Assert-Equal -Actual $imageBytes -Expected "0" -Message "Expired production image bytes were not purged."
    Assert-Equal -Actual (Get-StatusCode -Uri "$apiBase/api/scan-items/$($permitItem.scanItemId)/image") -Expected "404" -Message "Purged production image endpoint should return 404."

    Invoke-WebRequest -Uri "$apiBase/api/ocr-training/samples/$trainingSampleId/image" -OutFile $trainingAfter -UseBasicParsing
    Assert-True -Condition ((Get-Item $trainingAfter).Length -gt 0) -Message "Training image copy should survive production retention purge."

    Write-Host "[6/8] Backup archive + SHA256 + isolated restore"
    if (Test-Path -LiteralPath $backupDirectory) {
        Remove-Item -LiteralPath $backupDirectory -Recurse -Force
    }

    & (Join-Path $projectRoot "scripts/backup-db.ps1") -OutputDirectory $backupDirectory -ComposeProjectName $projectName

    $backupFile = Get-ChildItem -LiteralPath $backupDirectory -Filter "*.dump" |
        Sort-Object LastWriteTimeUtc -Descending |
        Select-Object -First 1

    Assert-True -Condition ($null -ne $backupFile) -Message "Backup dump was not created."
    Assert-True -Condition (Test-Path -LiteralPath "$($backupFile.FullName).sha256.txt") -Message "Backup SHA256 sidecar missing."

    $tourCountBefore = Invoke-Psql "SELECT COUNT(*) FROM tours;"
    $extraTour = Invoke-Api -Method POST -Uri "$apiBase/api/tours" -Body @{
        tourName = "Acceptance Restore Rollback Marker"
        departureDate = "2099-11-01"
        returnDate = "2099-11-03"
        requiredDocumentTypes = @("PASSPORT")
    }

    Assert-Equal -Actual (Invoke-Psql "SELECT COUNT(*) FROM tours;") -Expected ([int]$tourCountBefore + 1) -Message "Restore marker tour was not inserted."

    & (Join-Path $projectRoot "scripts/restore-db.ps1") -BackupFile $backupFile.FullName -Force -ComposeProjectName $projectName

    Wait-HttpOk "$apiBase/api/health"
    Wait-HttpOk "$frontendBase/api/health"
    Assert-Equal -Actual (Invoke-Psql "SELECT COUNT(*) FROM tours;") -Expected $tourCountBefore -Message "Database restore did not return to the backup snapshot."
    Assert-Equal -Actual (Get-StatusCode -Uri "$apiBase/api/tours/$($extraTour.tourId)") -Expected "404" -Message "Post-backup marker survived restore unexpectedly."

    Write-Host "[7/8] Persistence after backend restart"
    & docker @composeArgs restart backend | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Backend restart failed."
    }
    Wait-HttpOk "$apiBase/api/health"

    $detailAfterRestart = Invoke-Api -Method GET -Uri "$apiBase/api/tours/$($tour.tourId)"
    Assert-Equal -Actual (@($detailAfterRestart.members).Count) -Expected 1 -Message "Tour member data did not persist across backend restart."
    Assert-Equal -Actual (@($detailAfterRestart.members[0].documents).Count) -Expected 2 -Message "Document data did not persist across backend restart."

    Write-Host "[8/8] Automated V2 launch acceptance passed"
    Write-Host ""
    Write-Host "Remaining browser-only acceptance:"
    Write-Host "  - real batch upload/OCR retry with private passport, permit and ID images"
    Write-Host "  - review viewer zoom/pan/rotate and re-edit"
    Write-Host "  - configurable CSV field selection/order and downloaded file inspection"
    Write-Host "These require the operator's private local data/UI and are intentionally not automated here."
}
finally {
    if (Test-Path -LiteralPath $backupDirectory) {
        Remove-Item -LiteralPath $backupDirectory -Recurse -Force -ErrorAction SilentlyContinue
    }

    Remove-Item -LiteralPath (Join-Path ([System.IO.Path]::GetTempPath()) "passport-scanner-production-before.png") -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath (Join-Path ([System.IO.Path]::GetTempPath()) "passport-scanner-training-after.png") -Force -ErrorAction SilentlyContinue

    if (-not $KeepStack) {
        Write-Host ""
        Write-Host "Cleaning isolated acceptance stack..."
        & docker @composeArgs down -v --remove-orphans | Out-Null
    }
    else {
        Write-Host ""
        Write-Host "Acceptance stack kept because -KeepStack was specified."
    }

    if ($null -eq $previousFrontendPort) {
        Remove-Item Env:FRONTEND_PORT -ErrorAction SilentlyContinue
    }
    else {
        $env:FRONTEND_PORT = $previousFrontendPort
    }

    if ($null -eq $previousBackendPort) {
        Remove-Item Env:BACKEND_PORT -ErrorAction SilentlyContinue
    }
    else {
        $env:BACKEND_PORT = $previousBackendPort
    }

    Set-Location $projectRoot
}
