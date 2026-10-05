namespace PassportScanner.Api.Contracts;

public sealed record CreateScanBatchRequest(
    string DocumentType);

public sealed record ScanBatchResponse(
    Guid ScanBatchId,
    Guid TourId,
    string DocumentType,
    string Status,
    int ItemCount,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);

public sealed record CreateScanItemRequest(
    string OriginalFileName,
    string ImageContentType,
    string ImageBase64,
    string NameZh,
    string NameEn,
    string? BirthDate,
    string Gender,
    string? Nationality,
    string DocumentNumber,
    string? IssuingCountry,
    string? ExpiryDate,
    string OcrPayloadJson);

public sealed record ReviewScanItemRequest(
    string NameZh,
    string NameEn,
    string? BirthDate,
    string Gender,
    string? Nationality,
    string DocumentNumber,
    string? IssuingCountry,
    string? ExpiryDate,
    bool UseForTraining = false);

public sealed record ScanItemResponse(
    Guid ScanItemId,
    Guid ScanBatchId,
    Guid DraftPersonId,
    string DocumentType,
    string OriginalFileName,
    string ImageContentType,
    string NameZh,
    string NameEn,
    DateOnly? BirthDate,
    string Gender,
    string? Nationality,
    string DocumentNumber,
    string? IssuingCountry,
    DateOnly? ExpiryDate,
    string ReviewStatus,
    DateTimeOffset? ReviewedAt,
    DateTimeOffset DeleteAfter,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);

public sealed record ReviewQueuePersonResponse(
    Guid DraftPersonId,
    string NameZh,
    DateOnly? BirthDate,
    string Gender,
    IReadOnlyList<ScanItemResponse> Documents);
