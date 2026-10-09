namespace PassportScanner.Api.Contracts;

public sealed record SaveOcrBenchmarkRunRequest(
    string PipelineVersion,
    int SampleCount,
    int FailedCount,
    int BaselineCreatedCount,
    string SummaryJson);

public sealed record OcrBenchmarkRunResponse(
    Guid BenchmarkRunId,
    string PipelineVersion,
    int SampleCount,
    int FailedCount,
    int BaselineCreatedCount,
    string SummaryJson,
    DateTimeOffset CreatedAt);
