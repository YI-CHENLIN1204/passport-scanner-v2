using System.IO.Compression;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using PassportScanner.Api.Contracts;
using PassportScanner.Api.Domain;
using PassportScanner.Api.Text;

namespace PassportScanner.Api.Persistence;

public sealed class PostgresTrainingDatasetStore(
    PassportScannerDbContext db)
    : ITrainingDatasetStore
{
    private const string Reviewed = "REVIEWED";

    public TrainingSampleSelectionResponse SetSelection(
        Guid scanItemId,
        bool selected,
        DateTimeOffset now)
    {
        var scanItem = db.ScanItems.SingleOrDefault(
            item => item.ScanItemId == scanItemId)
            ?? throw new KeyNotFoundException(
                "找不到指定掃描資料。");

        if (scanItem.ReviewStatus != Reviewed)
        {
            throw new InvalidOperationException(
                "只有完成人工審核的證件才能加入訓練資料集。");
        }

        var existing = db.TrainingSamples
            .SingleOrDefault(item =>
                item.SourceScanItemId == scanItemId);

        if (!selected)
        {
            if (existing is not null)
            {
                db.TrainingSamples.Remove(existing);
                db.SaveChanges();
            }

            return new TrainingSampleSelectionResponse(
                scanItemId,
                false,
                null,
                now);
        }

        var groundTruthJson =
            BuildGroundTruthJson(scanItem);

        if (existing is null)
        {
            existing = new TrainingSampleRecord
            {
                TrainingSampleId = Guid.NewGuid(),
                SourceScanItemId = scanItem.ScanItemId,
                DocumentType = scanItem.DocumentType,
                ImageContentType =
                    scanItem.ImageContentType,
                ImageBytes =
                    scanItem.ImageBytes.ToArray(),
                OcrPayloadJson =
                    scanItem.OcrPayloadJson,
                GroundTruthJson =
                    groundTruthJson,
                SelectedAt = now,
                UpdatedAt = now
            };

            db.TrainingSamples.Add(existing);
        }
        else
        {
            existing.GroundTruthJson =
                groundTruthJson;
            existing.UpdatedAt = now;
        }

        db.SaveChanges();

        return new TrainingSampleSelectionResponse(
            scanItemId,
            true,
            existing.TrainingSampleId,
            existing.UpdatedAt);
    }

    public void RefreshSelectedSample(
        Guid scanItemId,
        DateTimeOffset now)
    {
        var sample = db.TrainingSamples
            .SingleOrDefault(item =>
                item.SourceScanItemId == scanItemId);

        if (sample is null)
        {
            return;
        }

        var scanItem = db.ScanItems
            .AsNoTracking()
            .SingleOrDefault(item =>
                item.ScanItemId == scanItemId);

        if (scanItem is null ||
            scanItem.ReviewStatus != Reviewed)
        {
            return;
        }

        sample.GroundTruthJson =
            BuildGroundTruthJson(scanItem);
        sample.UpdatedAt = now;
        db.SaveChanges();
    }

    public TrainingDatasetSummaryResponse GetSummary(
        DateTimeOffset generatedAt)
    {
        var usableSamples = db.TrainingSamples
            .AsNoTracking()
            .ToList()
            .Where(IsUsableTrainingSample)
            .ToList();

        var splitBySample =
            BuildSplitAssignments(usableSamples);

        var rows = usableSamples
            .GroupBy(
                item => item.DocumentType,
                StringComparer.Ordinal)
            .OrderBy(group => group.Key)
            .Select(group =>
            {
                var samples = group.ToList();

                return new TrainingDatasetDocumentSummary(
                    group.Key,
                    samples.Count,
                    samples.Count(sample =>
                        splitBySample[sample.TrainingSampleId] ==
                            "train"),
                    samples.Count(sample =>
                        splitBySample[sample.TrainingSampleId] ==
                            "validation"),
                    samples.Count(sample =>
                        splitBySample[sample.TrainingSampleId] ==
                            "test"));
            })
            .ToList();

        return new TrainingDatasetSummaryResponse(
            usableSamples.Count,
            usableSamples.Count(sample =>
                splitBySample[sample.TrainingSampleId] ==
                    "train"),
            usableSamples.Count(sample =>
                splitBySample[sample.TrainingSampleId] ==
                    "validation"),
            usableSamples.Count(sample =>
                splitBySample[sample.TrainingSampleId] ==
                    "test"),
            rows,
            generatedAt);
    }

    public IReadOnlyList<TrainingEvaluationSampleResponse>
        ListEvaluationSamples(
            string split)
    {
        var normalizedSplit =
            split.Trim().ToLowerInvariant();

        if (
            normalizedSplit is not
            ("train" or "validation" or "test"))
        {
            throw new ArgumentException(
                "split 必須是 train、validation 或 test。",
                nameof(split));
        }

        var usableSamples = db.TrainingSamples
            .AsNoTracking()
            .OrderBy(item => item.DocumentType)
            .ThenBy(item => item.SelectedAt)
            .ToList()
            .Where(IsUsableTrainingSample)
            .ToList();

        var splitBySample =
            BuildSplitAssignments(usableSamples);

        var selectedSamples = usableSamples
            .Where(sample =>
                splitBySample[sample.TrainingSampleId] ==
                    normalizedSplit)
            .ToList();

        var selectedIds = selectedSamples
            .Select(sample => sample.TrainingSampleId)
            .ToList();

        var baselineBySample =
            db.OcrEvaluationBaselines
                .AsNoTracking()
                .Where(item =>
                    selectedIds.Contains(
                        item.TrainingSampleId))
                .ToDictionary(
                    item => item.TrainingSampleId,
                    item => item.ResultJson);

        return selectedSamples
            .Select(sample =>
                new TrainingEvaluationSampleResponse(
                    sample.TrainingSampleId,
                    sample.DocumentType,
                    normalizedSplit,
                    sample.OcrPayloadJson,
                    baselineBySample.TryGetValue(
                        sample.TrainingSampleId,
                        out var baselineJson)
                        ? baselineJson
                        : null,
                    sample.GroundTruthJson))
            .ToList();
    }

    public TrainingDatasetSampleImage? GetSampleImage(
        Guid trainingSampleId)
    {
        var sample = db.TrainingSamples
            .AsNoTracking()
            .SingleOrDefault(item =>
                item.TrainingSampleId ==
                    trainingSampleId);

        if (sample is null)
        {
            return null;
        }

        return new TrainingDatasetSampleImage(
            sample.ImageBytes,
            sample.ImageContentType,
            $"training-sample-{trainingSampleId:N}" +
            ExtensionFromContentType(
                sample.ImageContentType));
    }

    public EvaluationBaselineResponse SaveEvaluationBaseline(
        Guid trainingSampleId,
        string resultJson,
        DateTimeOffset now)
    {
        var sampleExists = db.TrainingSamples
            .AsNoTracking()
            .Any(item =>
                item.TrainingSampleId ==
                    trainingSampleId);

        if (!sampleExists)
        {
            throw new KeyNotFoundException(
                "找不到指定訓練樣本。");
        }

        try
        {
            using var _ =
                JsonDocument.Parse(resultJson);
        }
        catch (JsonException)
        {
            throw new ArgumentException(
                "Baseline resultJson 必須是有效 JSON。",
                nameof(resultJson));
        }

        var existing =
            db.OcrEvaluationBaselines
                .SingleOrDefault(item =>
                    item.TrainingSampleId ==
                        trainingSampleId);

        if (existing is null)
        {
            existing =
                new OcrEvaluationBaselineRecord
                {
                    TrainingSampleId =
                        trainingSampleId,
                    ResultJson = resultJson,
                    CapturedAt = now
                };

            db.OcrEvaluationBaselines.Add(existing);
            db.SaveChanges();
        }

        return new EvaluationBaselineResponse(
            existing.TrainingSampleId,
            existing.ResultJson,
            existing.CapturedAt);
    }

    public TrainingDatasetExport ExportZip(
        DateTimeOffset generatedAt)
    {
        var samples = db.TrainingSamples
            .AsNoTracking()
            .OrderBy(item => item.DocumentType)
            .ThenBy(item => item.SelectedAt)
            .ToList()
            .Where(IsUsableTrainingSample)
            .ToList();

        var splitBySample =
            BuildSplitAssignments(samples);

        using var stream = new MemoryStream();

        using (
            var archive = new ZipArchive(
                stream,
                ZipArchiveMode.Create,
                leaveOpen: true))
        {
            var manifest = new StringBuilder();
            var splitManifests =
                new Dictionary<string, StringBuilder>(
                    StringComparer.Ordinal)
                {
                    ["train"] = new StringBuilder(),
                    ["validation"] = new StringBuilder(),
                    ["test"] = new StringBuilder()
                };

            foreach (var sample in samples)
            {
                var extension = ExtensionFromContentType(
                    sample.ImageContentType);

                var imagePath =
                    $"images/{sample.DocumentType}/" +
                    $"{sample.TrainingSampleId:N}{extension}";

                var imageEntry =
                    archive.CreateEntry(
                        imagePath,
                        CompressionLevel.Fastest);

                using (
                    var imageStream =
                        imageEntry.Open())
                {
                    imageStream.Write(
                        sample.ImageBytes);
                }

                var labelPath =
                    $"labels/{sample.DocumentType}/" +
                    $"{sample.TrainingSampleId:N}.json";

                var labelEntry =
                    archive.CreateEntry(
                        labelPath,
                        CompressionLevel.Optimal);

                var split =
                    splitBySample[
                        sample.TrainingSampleId];

                var labelDocument =
                    JsonSerializer.Serialize(
                        new
                        {
                            sampleId =
                                sample.TrainingSampleId,
                            sourceScanItemId =
                                sample.SourceScanItemId,
                            documentType =
                                sample.DocumentType,
                            split,
                            selectedAt =
                                sample.SelectedAt,
                            image = imagePath,
                            originalOcr =
                                TryReadJson(
                                    sample.OcrPayloadJson),
                            groundTruth =
                                TryReadJson(
                                    sample.GroundTruthJson)
                        },
                        new JsonSerializerOptions
                        {
                            WriteIndented = true
                        });

                using (
                    var labelWriter =
                        new StreamWriter(
                            labelEntry.Open(),
                            Encoding.UTF8))
                {
                    labelWriter.Write(
                        labelDocument);
                }

                var manifestLine =
                    JsonSerializer.Serialize(
                        new
                        {
                            sampleId =
                                sample.TrainingSampleId,
                            documentType =
                                sample.DocumentType,
                            split,
                            image = imagePath,
                            label = labelPath
                        });

                manifest.AppendLine(manifestLine);
                splitManifests[split]
                    .AppendLine(manifestLine);
            }

            var manifestEntry =
                archive.CreateEntry(
                    "manifest.jsonl",
                    CompressionLevel.Optimal);

            using (
                var manifestWriter =
                    new StreamWriter(
                        manifestEntry.Open(),
                        Encoding.UTF8))
            {
                manifestWriter.Write(
                    manifest.ToString());
            }

            foreach (
                var (split, splitManifest) in
                splitManifests)
            {
                var splitEntry =
                    archive.CreateEntry(
                        $"splits/{split}.jsonl",
                        CompressionLevel.Optimal);

                using var splitWriter =
                    new StreamWriter(
                        splitEntry.Open(),
                        Encoding.UTF8);

                splitWriter.Write(
                    splitManifest.ToString());
            }

            var readmeEntry =
                archive.CreateEntry(
                    "README.txt",
                    CompressionLevel.Optimal);

            using (
                var readmeWriter =
                    new StreamWriter(
                        readmeEntry.Open(),
                        Encoding.UTF8))
            {
                readmeWriter.Write(
                    "Private OCR training export\n" +
                    $"Generated: {generatedAt:O}\n" +
                    $"Samples: {samples.Count}\n" +
                    $"Train: {samples.Count(sample => splitBySample[sample.TrainingSampleId] == "train")}\n" +
                    $"Validation: {samples.Count(sample => splitBySample[sample.TrainingSampleId] == "validation")}\n" +
                    $"Test: {samples.Count(sample => splitBySample[sample.TrainingSampleId] == "test")}\n\n" +
                    "Split policy: deterministic 70/15/15 by traveler identity. " +
                    "All retained documents from the same traveler stay in one split.\n\n" +
                    "This ZIP contains real identity-document images " +
                    "and reviewed ground truth. Keep it outside Git.\n" +
                    "The production photo-retention rule is unchanged. " +
                    "Only explicitly selected samples are copied here.\n");
            }
        }

        return new TrainingDatasetExport(
            stream.ToArray(),
            "application/zip",
            $"ocr-training-dataset-" +
            $"{generatedAt:yyyyMMdd-HHmmss}.zip");
    }

    private Dictionary<Guid, string>
        BuildSplitAssignments(
            IReadOnlyList<TrainingSampleRecord> samples)
    {
        if (samples.Count == 0)
        {
            return [];
        }

        var sourceIds = samples
            .Select(sample =>
                sample.SourceScanItemId)
            .Distinct()
            .ToList();

        var scanItems = db.ScanItems
            .AsNoTracking()
            .Where(item =>
                sourceIds.Contains(
                    item.ScanItemId))
            .Select(item => new
            {
                item.ScanItemId,
                item.DraftPersonId,
                item.SavedDocumentVersionId
            })
            .ToList();

        var documentIds = scanItems
            .Where(item =>
                item.SavedDocumentVersionId.HasValue)
            .Select(item =>
                item.SavedDocumentVersionId!.Value)
            .Distinct()
            .ToList();

        var travelerByDocument = db.DocumentVersions
            .AsNoTracking()
            .Where(document =>
                documentIds.Contains(
                    document.DocumentVersionId))
            .Select(document => new
            {
                document.DocumentVersionId,
                document.TravelerId
            })
            .ToDictionary(
                item => item.DocumentVersionId,
                item => item.TravelerId);

        var sourceGroups = scanItems
            .ToDictionary(
                item => item.ScanItemId,
                item =>
                {
                    if (
                        item.SavedDocumentVersionId.HasValue &&
                        travelerByDocument.TryGetValue(
                            item.SavedDocumentVersionId.Value,
                            out var travelerId))
                    {
                        return $"traveler:{travelerId:N}";
                    }

                    return $"draft:{item.DraftPersonId:N}";
                });

        return samples.ToDictionary(
            sample => sample.TrainingSampleId,
            sample =>
            {
                var groupKey =
                    sourceGroups.TryGetValue(
                        sample.SourceScanItemId,
                        out var key)
                        ? key
                        : $"scan:{sample.SourceScanItemId:N}";

                return StableSplit(groupKey);
            });
    }

    private static string StableSplit(
        string groupKey)
    {
        var bytes = Encoding.UTF8.GetBytes(
            $"passport-scanner-v1|{groupKey}");
        var hash = SHA256.HashData(bytes);
        var bucket =
            ((uint)hash[0] << 24 |
             (uint)hash[1] << 16 |
             (uint)hash[2] << 8 |
             hash[3]) %
            10_000;

        if (bucket < 7_000)
        {
            return "train";
        }

        if (bucket < 8_500)
        {
            return "validation";
        }

        return "test";
    }

    private static bool IsUsableTrainingSample(
        TrainingSampleRecord sample)
    {
        if (
            sample.DocumentType !=
            "TAIWAN_COMPATRIOT_PERMIT")
        {
            return true;
        }

        try
        {
            using var groundTruth =
                JsonDocument.Parse(
                    sample.GroundTruthJson);
            using var ocrPayload =
                JsonDocument.Parse(
                    string.IsNullOrWhiteSpace(
                        sample.OcrPayloadJson)
                        ? "{}"
                        : sample.OcrPayloadJson);

            var hasCanonicalName =
                groundTruth.RootElement.TryGetProperty(
                    "businessNameZh",
                    out var businessName) &&
                businessName.ValueKind ==
                    JsonValueKind.String &&
                !string.IsNullOrWhiteSpace(
                    businessName.GetString());

            var hasRawOcrName =
                ocrPayload.RootElement.TryGetProperty(
                    "originalFields",
                    out var originalFields) &&
                originalFields.ValueKind ==
                    JsonValueKind.Object &&
                originalFields.TryGetProperty(
                    "nameZh",
                    out _);

            return
                hasCanonicalName &&
                hasRawOcrName;
        }
        catch (JsonException)
        {
            return false;
        }
    }

    private static string BuildGroundTruthJson(
        ScanItemRecord item) =>
        JsonSerializer.Serialize(
            new
            {
                nameZh =
                    item.DocumentType == "TAIWAN_COMPATRIOT_PERMIT"
                        ? ChineseScriptConverter
                            .TraditionalToSimplified(
                                item.NameZh)
                        : item.NameZh,
                businessNameZh = item.NameZh,
                nameZhOnDocument = item.NameZhOnDocument,
                nameEn = item.NameEn,
                birthDate =
                    item.BirthDate?.ToString(
                        "yyyy-MM-dd"),
                gender = item.Gender,
                nationality =
                    item.Nationality,
                nationalIdNumber =
                    item.NationalIdNumber,
                documentNumber =
                    item.DocumentNumber,
                issuingCountry =
                    item.IssuingCountry,
                expiryDate =
                    item.ExpiryDate?.ToString(
                        "yyyy-MM-dd")
            });

    private static object? TryReadJson(
        string json)
    {
        try
        {
            return JsonSerializer.Deserialize<
                JsonElement>(json);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static string ExtensionFromContentType(
        string contentType) =>
        contentType.ToLowerInvariant() switch
        {
            "image/png" => ".png",
            "image/webp" => ".webp",
            _ => ".jpg"
        };
}
