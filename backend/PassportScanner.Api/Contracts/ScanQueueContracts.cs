namespace PassportScanner.Api.Contracts;

public sealed record CreateScanBatchRequest(
    string DocumentType);

public sealed record CompleteScanBatchRequest(
    int AttemptCount,
    int FailedCount);

public sealed record ScanBatchResponse(
    Guid ScanBatchId,
    Guid TourId,
    string DocumentType,
    string Status,
    int ItemCount,
    int AttemptCount,
    int FailedCount,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);

public sealed record CreateScanItemRequest(
    string OriginalFileName,
    string ImageContentType,
    string ImageBase64,
    string? OcrInputImageContentType,
    string? OcrInputImageBase64,
    string NameZh,
    string? NameZhOnDocument,
    string NameEn,
    string? BirthDate,
    string Gender,
    string? Nationality,
    string? NationalIdNumber,
    string DocumentNumber,
    string? IssuingCountry,
    string? ExpiryDate,
    string OcrPayloadJson);

public sealed record ReviewScanItemRequest(
    string NameZh,
    string? NameZhOnDocument,
    string NameEn,
    string? BirthDate,
    string Gender,
    string? Nationality,
    string? NationalIdNumber,
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
    bool ImageAvailable,
    string NameZh,
    string NameZhOnDocument,
    string NameEn,
    DateOnly? BirthDate,
    string Gender,
    string? Nationality,
    string? NationalIdNumber,
    string DocumentNumber,
    string? IssuingCountry,
    DateOnly? ExpiryDate,
    Guid? SavedDocumentVersionId,
    string ReviewStatus,
    bool TrainingSelected,
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
