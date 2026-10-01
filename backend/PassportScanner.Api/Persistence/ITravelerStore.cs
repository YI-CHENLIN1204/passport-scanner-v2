using PassportScanner.Api.Domain;

namespace PassportScanner.Api.Persistence;

public enum DocumentSaveAction
{
    CreatedTravelerAndDocument,
    CreatedDocumentVersion,
    UpdatedExistingDocument
}

public sealed record ReviewedDocumentInput(
    string DocumentType,
    string ChineseName,
    string EnglishName,
    DateOnly BirthDate,
    string Sex,
    string? Nationality,
    string DocumentNumber,
    string? IssuingCountry,
    DateOnly ExpiryDate,
    DateTimeOffset VerifiedAt);

public sealed record DocumentSaveResult(
    DocumentSaveAction Action,
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
    DocumentSaveResult SaveDocumentReview(
        ReviewedDocumentInput input,
        DateTimeOffset now);

    int TravelerCount { get; }
    int DocumentVersionCount { get; }
}
