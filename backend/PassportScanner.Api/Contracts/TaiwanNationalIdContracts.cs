namespace PassportScanner.Api.Contracts;

public sealed record TaiwanNationalIdReviewRequest(
    int SchemaVersion,
    string DocumentType,
    string ChineseName,
    string NationalId,
    string BirthDate,
    string Sex,
    TaiwanNationalIdReviewAssertions ReviewAssertions,
    TaiwanNationalIdOcrMetadata Ocr,
    DateTimeOffset ReviewedAt);

public sealed record TaiwanNationalIdReviewAssertions(
    bool AllFieldsVisuallyConfirmed);

public sealed record TaiwanNationalIdOcrMetadata(
    string Engine,
    int ExtractedFieldCount,
    double? AverageScore);

public sealed record TaiwanNationalIdReviewSaveResponse(
    bool Accepted,
    string Persistence,
    string Action,
    Guid TravelerId,
    Guid DocumentVersionId,
    int TravelerDocumentVersionCount,
    DateTimeOffset SavedAt,
    IReadOnlyList<string> Warnings);
