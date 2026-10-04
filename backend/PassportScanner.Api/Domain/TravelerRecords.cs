namespace PassportScanner.Api.Domain;

public sealed class TravelerRecord
{
    public required Guid TravelerId { get; init; }
    public required string NameZh { get; set; }
    public required string NameEn { get; set; }
    public required DateOnly BirthDate { get; set; }
    public required string Gender { get; set; }
    public string? Nationality { get; set; }
    public required string PersonalIdType { get; set; }
    public required string PersonalIdNumber { get; set; }
    public required DateTimeOffset CreatedAt { get; init; }
    public required DateTimeOffset UpdatedAt { get; set; }
}

public sealed class DocumentVersionRecord
{
    public required Guid DocumentVersionId { get; init; }
    public required Guid TravelerId { get; set; }
    public required string DocumentType { get; init; }
    public required string NameZhOnDocument { get; set; }
    public required string NameEnOnDocument { get; set; }
    public required string DocumentNumber { get; set; }
    public string? IssuingCountry { get; set; }
    public string? Nationality { get; set; }
    public DateOnly? ExpiryDate { get; set; }
    public required bool IsCurrent { get; set; }
    public required DateTimeOffset VerifiedAt { get; set; }
    public required DateTimeOffset CreatedAt { get; init; }
}
