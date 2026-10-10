using PassportScanner.Api.Contracts;

namespace PassportScanner.Api.Persistence;

public interface ITourStore
{
    IReadOnlyList<TourSummaryResponse> ListTours(
        string? query,
        string? status,
        string? documentType,
        DateOnly? departureFrom,
        DateOnly? departureTo);
    TourDetailResponse? GetTour(Guid tourId);
    TourSummaryResponse CreateTour(
        CreateTourRequest request,
        DateTimeOffset now);

    TourSummaryResponse? UpdateTour(
        Guid tourId,
        UpdateTourRequest request,
        DateTimeOffset now);
    bool EnsureMemberDocument(
        Guid tourId,
        Guid travelerId,
        Guid documentVersionId,
        string documentType,
        DateTimeOffset now,
        TourMemberDocumentSnapshotInput? snapshot = null);

    bool RemoveMemberDocument(
        Guid tourId,
        Guid travelerId,
        string documentType,
        DateTimeOffset now);

    byte[] ExportCsv(Guid tourId);
}


public sealed record TourMemberDocumentSnapshotInput(
    string NameZh,
    string NameEn,
    DateOnly BirthDate,
    string Gender,
    string? Nationality,
    string? NationalIdNumber,
    string NameZhOnDocument,
    string NameEnOnDocument,
    string DocumentNumber,
    string? IssuingCountry,
    string? DocumentNationality,
    DateOnly? ExpiryDate,
    DateTimeOffset VerifiedAt);
