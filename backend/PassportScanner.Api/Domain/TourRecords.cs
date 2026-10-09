namespace PassportScanner.Api.Domain;

public sealed class TourRecord
{
    public required Guid TourId { get; init; }
    public required string TourName { get; set; }
    public required DateOnly DepartureDate { get; set; }
    public required DateOnly ReturnDate { get; set; }
    public required string[] RequiredDocumentTypes { get; set; }
    public required DateTimeOffset CreatedAt { get; init; }
    public required DateTimeOffset UpdatedAt { get; set; }
}

public sealed class TourMemberRecord
{
    public required Guid TourMemberId { get; init; }
    public required Guid TourId { get; init; }
    public required Guid TravelerId { get; set; }
    public required DateTimeOffset CreatedAt { get; init; }
}

public sealed class TourMemberDocumentRecord
{
    public required Guid TourMemberDocumentId { get; init; }
    public required Guid TourMemberId { get; set; }
    public required Guid DocumentVersionId { get; set; }
    public required string DocumentType { get; init; }

    // Immutable-per-tour business/document snapshot. It is refreshed only
    // when this tour explicitly links/re-reviews a document, not when the
    // global Traveler or current DocumentVersion is edited later.
    public required string SnapshotNameZh { get; set; }
    public required string SnapshotNameEn { get; set; }
    public required DateOnly SnapshotBirthDate { get; set; }
    public required string SnapshotGender { get; set; }
    public string? SnapshotNationality { get; set; }
    public string? SnapshotNationalIdNumber { get; set; }
    public required string SnapshotNameZhOnDocument { get; set; }
    public required string SnapshotNameEnOnDocument { get; set; }
    public required string SnapshotDocumentNumber { get; set; }
    public string? SnapshotIssuingCountry { get; set; }
    public string? SnapshotDocumentNationality { get; set; }
    public DateOnly? SnapshotExpiryDate { get; set; }
    public required DateTimeOffset SnapshotVerifiedAt { get; set; }

    public required DateTimeOffset CreatedAt { get; init; }
    public required DateTimeOffset UpdatedAt { get; set; }
}
