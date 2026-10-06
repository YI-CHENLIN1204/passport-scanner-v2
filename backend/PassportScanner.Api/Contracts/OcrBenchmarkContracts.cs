namespace PassportScanner.Api.Contracts;

public sealed record OcrBenchmarkFieldMetric(
    string Field,
    int ComparedCount,
    int ExactMatchCount,
    double ExactMatchRate,
    int MissingPredictionCount,
    double MissingPredictionRate,
    int WrongPredictionCount,
    double WrongPredictionRate);

public sealed record OcrBenchmarkSignalMetric(
    string Signal,
    int ObservedCount,
    int PositiveCount,
    double PositiveRate);

public sealed record OcrBenchmarkDocumentSummary(
    string DocumentType,
    int ReviewedSampleCount,
    int ScoredSampleCount,
    int FullDocumentExactCount,
    double FullDocumentExactRate,
    int ManualCorrectionCount,
    double ManualCorrectionRate,
    double? AverageTotalMs,
    double? MedianTotalMs,
    double? P90TotalMs,
    double? AverageOrientationAttempts,
    double? FallbackRate,
    IReadOnlyList<OcrBenchmarkSignalMetric> Signals,
    IReadOnlyList<OcrBenchmarkFieldMetric> Fields);

public sealed record OcrBenchmarkSummaryResponse(
    DateTimeOffset GeneratedAt,
    int ReviewedSampleCount,
    int ScoredSampleCount,
    IReadOnlyList<OcrBenchmarkDocumentSummary> Documents);
