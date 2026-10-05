using PassportScanner.Api.Contracts;

namespace PassportScanner.Api.Persistence;

public interface IOcrBenchmarkStore
{
    OcrBenchmarkSummaryResponse GetSummary(
        DateTimeOffset generatedAt);
}
