namespace PassportScanner.Api.Contracts;

public sealed record TravelerSummaryResponse(
    Guid TravelerId,
    string NameZh,
    string NameEn,
    string BirthDate,
    string Gender,
    string? Nationality,
    int DocumentVersionCount,
    IReadOnlyList<string> CurrentDocumentTypes);

public sealed record DocumentVersionResponse(
    Guid DocumentVersionId,
    string DocumentType,
    string NameZhOnDocument,
    string NameEnOnDocument,
    string DocumentNumber,
    string? IssuingCountry,
    string? Nationality,
    string ExpiryDate,
    bool IsCurrent,
    DateTimeOffset VerifiedAt,
    DateTimeOffset CreatedAt);

public sealed record TravelerDetailResponse(
    TravelerSummaryResponse Traveler,
    IReadOnlyList<DocumentVersionResponse> Documents);

public sealed record DocumentStoreStatusResponse(
    string Persistence,
    int TravelerCount,
    int DocumentVersionCount,
    DateTimeOffset CheckedAt);
