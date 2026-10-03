using PassportScanner.Api.Contracts;

namespace PassportScanner.Api.Persistence;

public interface ITourStore
{
    IReadOnlyList<TourSummaryResponse> ListTours(string? query);
    TourDetailResponse? GetTour(Guid tourId);
    TourSummaryResponse CreateTour(
        CreateTourRequest request,
        DateTimeOffset now);
    bool EnsureMember(
        Guid tourId,
        Guid travelerId,
        DateTimeOffset now);
    byte[] ExportCsv(Guid tourId);
}
