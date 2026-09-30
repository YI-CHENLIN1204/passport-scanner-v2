namespace PassportScanner.Api.Contracts;

public sealed record PassportReviewRequest(
    int SchemaVersion,
    string DocumentType,
    string EnglishName,
    string PassportNumber,
    string Nationality,
    string IssuingState,
    string BirthDate,
    string Sex,
    string ExpiryDate,
    PassportReviewVerification Verification,
    PassportReviewOcrMetadata Ocr,
    DateTimeOffset ReviewedAt);

public sealed record PassportReviewVerification(
    bool? PassportNumberCheckDigit,
    bool? BirthDateCheckDigit,
    bool? ExpiryDateCheckDigit,
    bool? CompositeCheckDigit);

public sealed record PassportReviewOcrMetadata(
    string Engine,
    bool Line2Validated,
    bool FallbackUsed,
    double? AverageScore);

public sealed record PassportReviewValidationResponse(
    bool Accepted,
    string Persistence,
    DateTimeOffset ReceivedAt,
    IReadOnlyList<string> Warnings);


public sealed record PassportReviewSaveResponse(
    bool Accepted,
    string Persistence,
    string Action,
    Guid TravelerId,
    Guid DocumentVersionId,
    int TravelerDocumentVersionCount,
    DateTimeOffset SavedAt,
    IReadOnlyList<string> Warnings);

public sealed record PassportStoreStatusResponse(
    string Persistence,
    int TravelerCount,
    int DocumentVersionCount,
    DateTimeOffset CheckedAt);
