namespace PassportScanner.Api.Domain;

public sealed class TourRecord
{
    public required Guid TourId { get; init; }
    public required string TourName { get; set; }
    public required DateOnly DepartureDate { get; set; }
    public required DateOnly ReturnDate { get; set; }
    public int? ExpectedMemberCount { get; set; }
    public required DateTimeOffset CreatedAt { get; init; }
    public required DateTimeOffset UpdatedAt { get; set; }
}

public sealed class TourMemberRecord
{
    public required Guid TourMemberId { get; init; }
    public required Guid TourId { get; init; }
    public required Guid TravelerId { get; init; }
    public required DateTimeOffset CreatedAt { get; init; }
}
