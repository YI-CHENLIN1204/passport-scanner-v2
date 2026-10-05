namespace PassportScanner.Api.Contracts;

public sealed record TravelerSummaryResponse(
    Guid TravelerId,
    string NameZh,
    string NameEn,
    string BirthDate,
    string Gender,
    string? Nationality,
    string? NationalIdNumber,
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
    string? ExpiryDate,
    bool IsCurrent,
    DateTimeOffset VerifiedAt,
    DateTimeOffset CreatedAt);

public sealed record TravelerDetailResponse(
    TravelerSummaryResponse Traveler,
    IReadOnlyList<DocumentVersionResponse> Documents);

public sealed record UpdateTravelerDocumentRequest(
    Guid DocumentVersionId,
    string NameZhOnDocument,
    string NameEnOnDocument,
    string DocumentNumber,
    string? IssuingCountry,
    string? Nationality,
    string? ExpiryDate);

public sealed record UpdateTravelerRequest(
    string NameZh,
    string NameEn,
    string BirthDate,
    string Gender,
    string? Nationality,
    string? NationalIdNumber,
    IReadOnlyList<UpdateTravelerDocumentRequest>? Documents);

public sealed record DocumentStoreStatusResponse(
    string Persistence,
    int TravelerCount,
    int DocumentVersionCount,
    DateTimeOffset CheckedAt);
