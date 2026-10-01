namespace PassportScanner.Api.Contracts;

public sealed record TaiwanCompatriotPermitReviewRequest(
    int SchemaVersion,
    string DocumentType,
    string ChineseName,
    string PermitNumber,
    string BirthDate,
    string Sex,
    string ExpiryDate,
    TaiwanCompatriotPermitReviewAssertions ReviewAssertions,
    TaiwanCompatriotPermitOcrMetadata Ocr,
    DateTimeOffset ReviewedAt);

public sealed record TaiwanCompatriotPermitReviewAssertions(
    bool AllFieldsVisuallyConfirmed);

public sealed record TaiwanCompatriotPermitOcrMetadata(
    string Engine,
    int ExtractedFieldCount,
    double? AverageScore);

public sealed record TaiwanCompatriotPermitReviewSaveResponse(
    bool Accepted,
    string Persistence,
    string Action,
    Guid TravelerId,
    Guid DocumentVersionId,
    int TravelerDocumentVersionCount,
    DateTimeOffset SavedAt,
    IReadOnlyList<string> Warnings);
