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
    public required DateTimeOffset CreatedAt { get; init; }
    public required DateTimeOffset UpdatedAt { get; set; }
}
