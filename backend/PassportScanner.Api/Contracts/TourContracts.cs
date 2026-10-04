namespace PassportScanner.Api.Contracts;

public sealed record CreateTourRequest(
    string TourName,
    DateOnly DepartureDate,
    DateOnly ReturnDate,
    IReadOnlyList<string>? RequiredDocumentTypes);

public sealed record TourSummaryResponse(
    Guid TourId,
    string TourName,
    DateOnly DepartureDate,
    DateOnly ReturnDate,
    IReadOnlyList<string> RequiredDocumentTypes,
    int ReviewedMemberCount,
    int DocumentCount,
    int MemberCount,
    int ReceivedDocumentCount,
    int PendingReviewCount,
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
