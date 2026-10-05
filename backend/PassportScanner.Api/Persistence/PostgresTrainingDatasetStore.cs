using System.IO.Compression;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using PassportScanner.Api.Contracts;
using PassportScanner.Api.Domain;

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

    public TrainingDatasetSummaryResponse GetSummary(
        DateTimeOffset generatedAt)
    {
        var counts = db.TrainingSamples
            .AsNoTracking()
            .GroupBy(item => item.DocumentType)
            .Select(group => new
            {
                DocumentType = group.Key,
                SampleCount = group.Count()
            })
            .ToList();

        var rows = counts
            .OrderBy(
                item => item.DocumentType,
                StringComparer.Ordinal)
            .Select(item =>
                new TrainingDatasetDocumentSummary(
                    item.DocumentType,
                    item.SampleCount))
            .ToList();

        return new TrainingDatasetSummaryResponse(
            rows.Sum(item => item.SampleCount),
            rows,
            generatedAt);
    }

    public TrainingDatasetExport ExportZip(
        DateTimeOffset generatedAt)
    {
        var samples = db.TrainingSamples
            .AsNoTracking()
            .OrderBy(item => item.DocumentType)
            .ThenBy(item => item.SelectedAt)
            .ToList();

        using var stream = new MemoryStream();

        using (
            var archive = new ZipArchive(
                stream,
                ZipArchiveMode.Create,
                leaveOpen: true))
        {
            var manifest = new StringBuilder();

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

                manifest.AppendLine(
                    JsonSerializer.Serialize(
                        new
                        {
                            sampleId =
                                sample.TrainingSampleId,
                            documentType =
                                sample.DocumentType,
                            image = imagePath,
                            label = labelPath
                        }));
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
                    $"Samples: {samples.Count}\n\n" +
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

    private static string BuildGroundTruthJson(
        ScanItemRecord item) =>
        JsonSerializer.Serialize(
            new
            {
                nameZh =
                    item.DocumentType == "TAIWAN_COMPATRIOT_PERMIT"
                        ? item.NameZhOnDocument
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
