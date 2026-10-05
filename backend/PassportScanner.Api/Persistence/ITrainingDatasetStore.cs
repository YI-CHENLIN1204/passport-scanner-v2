using PassportScanner.Api.Contracts;

namespace PassportScanner.Api.Persistence;

public interface ITrainingDatasetStore
{
    TrainingSampleSelectionResponse SetSelection(
        Guid scanItemId,
        bool selected,
        DateTimeOffset now);

    void RefreshSelectedSample(
        Guid scanItemId,
        DateTimeOffset now);

    TrainingDatasetSummaryResponse GetSummary(
        DateTimeOffset generatedAt);

    TrainingDatasetExport ExportZip(
        DateTimeOffset generatedAt);
}
