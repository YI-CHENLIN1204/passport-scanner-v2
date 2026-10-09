using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using PassportScanner.Api.Contracts;
using PassportScanner.Api.Domain;

namespace PassportScanner.Api.Persistence;

public sealed class PostgresOcrBenchmarkRunStore(
    PassportScannerDbContext db)
    : IOcrBenchmarkRunStore
{
    public OcrBenchmarkRunResponse Save(
        SaveOcrBenchmarkRunRequest request,
        DateTimeOffset now)
    {
        var pipelineVersion =
            request.PipelineVersion.Trim();

        if (string.IsNullOrWhiteSpace(pipelineVersion))
        {
            throw new ArgumentException(
                "pipelineVersion 不可為空白。",
                nameof(request));
        }

        if (pipelineVersion.Length > 80)
        {
            throw new ArgumentException(
                "pipelineVersion 長度不可超過 80。",
                nameof(request));
        }

        if (
            request.SampleCount < 0 ||
            request.FailedCount < 0 ||
            request.BaselineCreatedCount < 0)
        {
            throw new ArgumentException(
                "Benchmark 計數不可為負數。",
                nameof(request));
        }

        try
        {
            using var _ =
                JsonDocument.Parse(request.SummaryJson);
        }
        catch (JsonException)
        {
            throw new ArgumentException(
                "summaryJson 必須是合法 JSON。",
                nameof(request));
        }

        var record = new OcrBenchmarkRunRecord
        {
            BenchmarkRunId = Guid.NewGuid(),
            PipelineVersion = pipelineVersion,
            SampleCount = request.SampleCount,
            FailedCount = request.FailedCount,
            BaselineCreatedCount =
                request.BaselineCreatedCount,
            SummaryJson = request.SummaryJson,
            CreatedAt = now
        };

        db.OcrBenchmarkRuns.Add(record);
        db.SaveChanges();

        return ToResponse(record);
    }

    public IReadOnlyList<OcrBenchmarkRunResponse> List(
        int limit)
    {
        var take = Math.Clamp(limit, 1, 50);

        return db.OcrBenchmarkRuns
            .AsNoTracking()
            .OrderByDescending(item => item.CreatedAt)
            .Take(take)
            .ToList()
            .Select(ToResponse)
            .ToList();
    }

    private static OcrBenchmarkRunResponse ToResponse(
        OcrBenchmarkRunRecord record)
    {
        return new OcrBenchmarkRunResponse(
            record.BenchmarkRunId,
            record.PipelineVersion,
            record.SampleCount,
            record.FailedCount,
            record.BaselineCreatedCount,
            record.SummaryJson,
            record.CreatedAt);
    }
}
