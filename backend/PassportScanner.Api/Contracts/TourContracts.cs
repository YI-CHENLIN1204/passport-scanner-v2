namespace PassportScanner.Api.Contracts;

public sealed record CreateTourRequest(
    string TourName,
    DateOnly DepartureDate,
    DateOnly ReturnDate,
    int? ExpectedMemberCount);

public sealed record TourSummaryResponse(
    Guid TourId,
    string TourName,
    DateOnly DepartureDate,
    DateOnly ReturnDate,
    int? ExpectedMemberCount,
    int ReviewedMemberCount,
    int DocumentCount,
    DateTimeOffset UpdatedAt);

public sealed record TourMemberDocumentResponse(
    Guid DocumentVersionId,
    string DocumentType,
    string DocumentNumber,
    DateOnly? ExpiryDate,
    bool IsCurrent,
    DateTimeOffset VerifiedAt);

public sealed record TourMemberResponse(
    Guid TourMemberId,
    Guid TravelerId,
    string NameZh,
    string NameEn,
    DateOnly BirthDate,
    string Gender,
    string? Nationality,
    IReadOnlyList<TourMemberDocumentResponse> Documents);

public sealed record TourDetailResponse(
    TourSummaryResponse Tour,
    IReadOnlyList<TourMemberResponse> Members);
