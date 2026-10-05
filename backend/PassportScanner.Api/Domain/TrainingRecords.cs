namespace PassportScanner.Api.Domain;

public sealed class TrainingSampleRecord
{
    public required Guid TrainingSampleId { get; init; }
    public required Guid SourceScanItemId { get; init; }
    public required string DocumentType { get; init; }
    public required string ImageContentType { get; init; }
    public required byte[] ImageBytes { get; init; }
    public required string OcrPayloadJson { get; init; }
    public required string GroundTruthJson { get; set; }
    public required DateTimeOffset SelectedAt { get; init; }
    public required DateTimeOffset UpdatedAt { get; set; }
}
