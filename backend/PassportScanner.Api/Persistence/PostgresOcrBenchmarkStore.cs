using System.Globalization;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using PassportScanner.Api.Contracts;
using PassportScanner.Api.Domain;

namespace PassportScanner.Api.Persistence;

public sealed class PostgresOcrBenchmarkStore(
    PassportScannerDbContext db)
    : IOcrBenchmarkStore
{
    private static readonly IReadOnlyDictionary<
        string,
        string[]> FieldsByDocumentType =
        new Dictionary<string, string[]>(
            StringComparer.Ordinal)
        {
            ["PASSPORT"] =
            [
                "nameZh",
                "nameEn",
                "birthDate",
                "gender",
                "nationality",
                "nationalIdNumber",
                "documentNumber",
                "issuingCountry",
                "expiryDate"
            ],
            ["TAIWAN_COMPATRIOT_PERMIT"] =
            [
                "nameZh",
                "birthDate",
                "gender",
                "documentNumber",
                "expiryDate"
            ],
            ["TAIWAN_NATIONAL_ID"] =
            [
                "nameZh",
                "birthDate",
                "gender",
                "documentNumber"
            ]
        };

    public OcrBenchmarkSummaryResponse GetSummary(
        DateTimeOffset generatedAt)
    {
        var reviewed = db.ScanItems
            .AsNoTracking()
            .Where(item =>
                item.ReviewStatus == "REVIEWED")
            .OrderBy(item => item.ReviewedAt)
            .ToList();

        var documents = reviewed
            .GroupBy(item => item.DocumentType)
            .OrderBy(group => group.Key)
            .Select(group => BuildDocumentSummary(
                group.Key,
                group.ToList()))
            .ToList();

        return new OcrBenchmarkSummaryResponse(
            generatedAt,
            reviewed.Count,
            documents.Sum(item =>
                item.ScoredSampleCount),
            documents);
    }

    private static OcrBenchmarkDocumentSummary
        BuildDocumentSummary(
            string documentType,
            IReadOnlyList<ScanItemRecord> items)
    {
        var fieldNames =
            FieldsByDocumentType.TryGetValue(
                documentType,
                out var configured)
                ? configured
                : [];

        var fieldExact = fieldNames.ToDictionary(
            field => field,
            _ => 0,
            StringComparer.Ordinal);

        var fieldCompared = fieldNames.ToDictionary(
            field => field,
            _ => 0,
            StringComparer.Ordinal);

        var scored = 0;
        var fullExact = 0;
        var corrected = 0;
        var totalTimes = new List<double>();
        var orientationAttempts =
            new List<double>();
        var fallbackCount = 0;
        var fallbackObserved = 0;

        foreach (var item in items)
        {
            using var payload =
                TryParsePayload(item.OcrPayloadJson);

            if (payload is null)
            {
                continue;
            }

            var root = payload.RootElement;

            AddNumber(
                root,
                "totalMs",
                totalTimes);

            AddNumber(
                root,
                "orientationAttempts",
                orientationAttempts);

            if (TryGetBoolean(
                root,
                "fallbackUsed",
                out var fallback))
            {
                fallbackObserved += 1;

                if (fallback)
                {
                    fallbackCount += 1;
                }
            }

            if (
                !root.TryGetProperty(
                    "originalFields",
                    out var original) ||
                original.ValueKind !=
                    JsonValueKind.Object)
            {
                continue;
            }

            // Permit OCR reads Mainland simplified characters, while the
            // canonical traveler master stores Traditional Chinese. Only new
            // samples that saved a normalized Traditional OCR value are
            // comparable without penalizing script conversion.
            if (
                item.DocumentType ==
                    "TAIWAN_COMPATRIOT_PERMIT" &&
                !original.TryGetProperty(
                    "nameZhTraditional",
                    out _))
            {
                continue;
            }

            scored += 1;
            var allExact = true;

            foreach (var field in fieldNames)
            {
                var originalField =
                    item.DocumentType ==
                        "TAIWAN_COMPATRIOT_PERMIT" &&
                    field == "nameZh"
                        ? "nameZhTraditional"
                        : field;

                var originalValue =
                    ReadJsonString(
                        original,
                        originalField);
                var reviewedValue =
                    ReadReviewedField(
                        item,
                        field);

                fieldCompared[field] += 1;

                if (FieldEquals(
                    field,
                    originalValue,
                    reviewedValue))
                {
                    fieldExact[field] += 1;
                }
                else
                {
                    allExact = false;
                }
            }

            if (allExact)
            {
                fullExact += 1;
            }
            else
            {
                corrected += 1;
            }
        }

        var fieldMetrics = fieldNames
            .Select(field =>
            {
                var compared =
                    fieldCompared[field];
                var exact = fieldExact[field];

                return new OcrBenchmarkFieldMetric(
                    field,
                    compared,
                    exact,
                    Rate(exact, compared));
            })
            .ToList();

        return new OcrBenchmarkDocumentSummary(
            documentType,
            items.Count,
            scored,
            fullExact,
            Rate(fullExact, scored),
            corrected,
            Rate(corrected, scored),
            Average(totalTimes),
            Percentile(totalTimes, 0.5),
            Percentile(totalTimes, 0.9),
            Average(orientationAttempts),
            fallbackObserved == 0
                ? null
                : Rate(
                    fallbackCount,
                    fallbackObserved),
            fieldMetrics);
    }

    private static JsonDocument? TryParsePayload(
        string json)
    {
        try
        {
            return JsonDocument.Parse(
                string.IsNullOrWhiteSpace(json)
                    ? "{}"
                    : json);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static void AddNumber(
        JsonElement root,
        string name,
        ICollection<double> target)
    {
        if (
            root.TryGetProperty(name, out var value) &&
            value.ValueKind == JsonValueKind.Number &&
            value.TryGetDouble(out var parsed))
        {
            target.Add(parsed);
        }
    }

    private static bool TryGetBoolean(
        JsonElement root,
        string name,
        out bool value)
    {
        value = false;

        if (!root.TryGetProperty(
            name,
            out var element))
        {
            return false;
        }

        if (
            element.ValueKind ==
            JsonValueKind.True)
        {
            value = true;
            return true;
        }

        if (
            element.ValueKind ==
            JsonValueKind.False)
        {
            return true;
        }

        return false;
    }

    private static string? ReadJsonString(
        JsonElement source,
        string property)
    {
        if (!source.TryGetProperty(
            property,
            out var value))
        {
            return null;
        }

        return value.ValueKind switch
        {
            JsonValueKind.String =>
                value.GetString(),
            JsonValueKind.Null => null,
            _ => value.ToString()
        };
    }

    private static string? ReadReviewedField(
        ScanItemRecord item,
        string field) =>
        field switch
        {
            "nameZh" => item.NameZh,
            "nameEn" => item.NameEn,
            "birthDate" =>
                item.BirthDate?.ToString(
                    "yyyy-MM-dd",
                    CultureInfo.InvariantCulture),
            "gender" => item.Gender,
            "nationality" => item.Nationality,
            "nationalIdNumber" =>
                item.NationalIdNumber,
            "documentNumber" =>
                item.DocumentNumber,
            "issuingCountry" =>
                item.IssuingCountry,
            "expiryDate" =>
                item.ExpiryDate?.ToString(
                    "yyyy-MM-dd",
                    CultureInfo.InvariantCulture),
            _ => null
        };

    private static bool FieldEquals(
        string field,
        string? left,
        string? right) =>
        NormalizeField(field, left) ==
        NormalizeField(field, right);

    private static string NormalizeField(
        string field,
        string? value)
    {
        var text = value?.Trim() ?? "";

        return field switch
        {
            "nameZh" =>
                string.Concat(
                    text.Where(character =>
                        !char.IsWhiteSpace(character))),
            "nameEn" =>
                string.Concat(
                    text.ToUpperInvariant()
                        .Where(character =>
                            char.IsLetterOrDigit(
                                character))),
            "nationalIdNumber" or
            "documentNumber" =>
                string.Concat(
                    text.ToUpperInvariant()
                        .Where(character =>
                            char.IsLetterOrDigit(
                                character))),
            "nationality" or
            "issuingCountry" or
            "gender" =>
                text.ToUpperInvariant(),
            _ => text
        };
    }

    private static double Rate(
        int numerator,
        int denominator) =>
        denominator == 0
            ? 0
            : Math.Round(
                (double)numerator /
                denominator,
                4);

    private static double? Average(
        IReadOnlyCollection<double> values) =>
        values.Count == 0
            ? null
            : Math.Round(
                values.Average(),
                1);

    private static double? Percentile(
        IReadOnlyCollection<double> values,
        double percentile)
    {
        if (values.Count == 0)
        {
            return null;
        }

        var ordered = values
            .OrderBy(value => value)
            .ToArray();

        var index = (int)Math.Ceiling(
            percentile * ordered.Length) - 1;

        index = Math.Clamp(
            index,
            0,
            ordered.Length - 1);

        return Math.Round(
            ordered[index],
            1);
    }
}
