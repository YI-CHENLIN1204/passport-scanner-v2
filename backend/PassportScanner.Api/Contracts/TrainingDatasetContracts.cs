namespace PassportScanner.Api.Contracts;

public sealed record SetTrainingSampleRequest(
    bool Selected);

public sealed record TrainingSampleSelectionResponse(
    Guid ScanItemId,
    bool Selected,
    Guid? TrainingSampleId,
    DateTimeOffset UpdatedAt);

public sealed record TrainingDatasetDocumentSummary(
    string DocumentType,
    int SampleCount,
    int TrainCount,
    int ValidationCount,
    int TestCount);

public sealed record TrainingDatasetSummaryResponse(
    int SampleCount,
    int TrainCount,
    int ValidationCount,
    int TestCount,
    IReadOnlyList<TrainingDatasetDocumentSummary> Documents,
    DateTimeOffset GeneratedAt);

public sealed record TrainingDatasetExport(
    byte[] Bytes,
    string ContentType,
    string FileName);
