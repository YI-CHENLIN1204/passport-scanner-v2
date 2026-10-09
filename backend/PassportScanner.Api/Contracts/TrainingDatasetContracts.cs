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


public sealed record TrainingEvaluationSampleResponse(
    Guid TrainingSampleId,
    string DocumentType,
    string Split,
    string OriginalOcrJson,
    string? EvaluationBaselineJson,
    string GroundTruthJson,
    bool HasExactOcrInput);

public sealed record SaveEvaluationBaselineRequest(
    string ResultJson);

public sealed record EvaluationBaselineResponse(
    Guid TrainingSampleId,
    string ResultJson,
    DateTimeOffset CapturedAt);

public sealed record FixedTestCohortResponse(
    int SampleCount,
    int NewlyReservedCount,
    DateTimeOffset UpdatedAt);

public sealed record TrainingDatasetSampleImage(
    byte[] Bytes,
    string ContentType,
    string FileName);
