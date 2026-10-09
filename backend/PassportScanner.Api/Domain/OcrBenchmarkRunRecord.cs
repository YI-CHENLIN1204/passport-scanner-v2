namespace PassportScanner.Api.Domain;

public sealed class OcrBenchmarkRunRecord
{
    public required Guid BenchmarkRunId { get; init; }
    public required string PipelineVersion { get; init; }
    public required int SampleCount { get; init; }
    public required int FailedCount { get; init; }
    public required int BaselineCreatedCount { get; init; }
    public required string SummaryJson { get; init; }
    public required DateTimeOffset CreatedAt { get; init; }
}
