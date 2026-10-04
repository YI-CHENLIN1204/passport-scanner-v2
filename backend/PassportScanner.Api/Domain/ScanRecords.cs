namespace PassportScanner.Api.Domain;

public sealed class ScanBatchRecord
{
    public required Guid ScanBatchId { get; init; }
    public required Guid TourId { get; init; }
    public required string DocumentType { get; init; }
    public required string Status { get; set; }
    public required int ItemCount { get; set; }
    public required DateTimeOffset CreatedAt { get; init; }
    public required DateTimeOffset UpdatedAt { get; set; }
}

public sealed class TourPersonDraftRecord
{
    public required Guid DraftPersonId { get; init; }
    public required Guid TourId { get; init; }
    public required string NameZh { get; set; }
    public DateOnly? BirthDate { get; set; }
    public required string Gender { get; set; }
    public required DateTimeOffset CreatedAt { get; init; }
    public required DateTimeOffset UpdatedAt { get; set; }
}

public sealed class ScanItemRecord
{
    public required Guid ScanItemId { get; init; }
    public required Guid ScanBatchId { get; init; }
    public required Guid DraftPersonId { get; set; }
    public required string DocumentType { get; init; }
    public required string OriginalFileName { get; init; }
    public required string ImageContentType { get; init; }
    public required byte[] ImageBytes { get; init; }
    public required string NameZh { get; set; }
    public required string NameEn { get; set; }
    public DateOnly? BirthDate { get; set; }
    public required string Gender { get; set; }
    public string? Nationality { get; set; }
    public required string DocumentNumber { get; set; }
    public string? IssuingCountry { get; set; }
    public DateOnly? ExpiryDate { get; set; }
    public required string OcrPayloadJson { get; set; }
    public required string ReviewStatus { get; set; }
    public DateTimeOffset? ReviewedAt { get; set; }
    public required DateTimeOffset DeleteAfter { get; init; }
    public required DateTimeOffset CreatedAt { get; init; }
    public required DateTimeOffset UpdatedAt { get; set; }
}
