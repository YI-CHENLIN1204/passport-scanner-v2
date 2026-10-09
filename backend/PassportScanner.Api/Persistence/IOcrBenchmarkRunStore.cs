using PassportScanner.Api.Contracts;

namespace PassportScanner.Api.Persistence;

public interface IOcrBenchmarkRunStore
{
    OcrBenchmarkRunResponse Save(
        SaveOcrBenchmarkRunRequest request,
        DateTimeOffset now);

    IReadOnlyList<OcrBenchmarkRunResponse> List(
        int limit);
}
