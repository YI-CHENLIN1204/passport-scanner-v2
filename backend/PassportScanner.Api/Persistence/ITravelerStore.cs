using PassportScanner.Api.Contracts;
using PassportScanner.Api.Domain;

namespace PassportScanner.Api.Persistence;

public enum PassportSaveAction
{
    CreatedTravelerAndDocument,
    CreatedDocumentVersion,
    UpdatedExistingDocument
}

public sealed record PassportSaveResult(
    PassportSaveAction Action,
    Guid TravelerId,
    Guid DocumentVersionId,
    int TravelerDocumentVersionCount);

public sealed class AmbiguousTravelerMatchException : Exception
{
    public AmbiguousTravelerMatchException()
        : base("找到多位可能相同的旅客，系統不會自動合併。")
    {
    }
}

public interface ITravelerStore
{
    PassportSaveResult SavePassportReview(
        PassportReviewRequest request,
        DateTimeOffset now);

    int TravelerCount { get; }
    int DocumentVersionCount { get; }
}
