using PassportScanner.Api.Contracts;
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
    string ChineseNameOnDocument,
    string EnglishName,
    DateOnly BirthDate,
    string Sex,
    string? Nationality,
    string? NationalIdNumber,
    string DocumentNumber,
    string? IssuingCountry,
    DateOnly? ExpiryDate,
    DateTimeOffset VerifiedAt);

public sealed record DocumentSaveResult(
    DocumentSaveAction Action,
    Guid TravelerId,
    Guid DocumentVersionId,
    int TravelerDocumentVersionCount);

public sealed record TravelerSummary(
    Guid TravelerId,
    string NameZh,
    string NameEn,
    DateOnly BirthDate,
    string Gender,
    string? Nationality,
    string? NationalIdNumber,
    int DocumentVersionCount,
    IReadOnlyList<string> CurrentDocumentTypes);

public sealed record DocumentVersionSummary(
    Guid DocumentVersionId,
    string DocumentType,
    string NameZhOnDocument,
    string NameEnOnDocument,
    string DocumentNumber,
    string? IssuingCountry,
    string? Nationality,
    DateOnly? ExpiryDate,
    bool IsCurrent,
    DateTimeOffset VerifiedAt,
    DateTimeOffset CreatedAt);

public sealed record TravelerDetail(
    TravelerSummary Traveler,
    IReadOnlyList<DocumentVersionSummary> Documents);

public sealed class AmbiguousTravelerMatchException : Exception
{
    public AmbiguousTravelerMatchException()
        : base("找到多位可能相同的旅客，系統不會自動合併；請先到「旅客資料」確認並人工合併。")
    {
    }

    public AmbiguousTravelerMatchException(
        string message)
        : base(message)
    {
    }
}

public interface ITravelerStore
{
    DocumentSaveResult SaveDocumentReview(
        ReviewedDocumentInput input,
        DateTimeOffset now);

    IReadOnlyList<TravelerSummary> SearchTravelers(
        string? query,
        string? documentType,
        string? gender,
        string? nationality,
        int offset,
        int limit);

    TravelerDetail? GetTraveler(Guid travelerId);

    TravelerDetail? UpdateTraveler(
        Guid travelerId,
        UpdateTravelerRequest request,
        DateTimeOffset now);

    TravelerDetail? MergeTravelers(
        Guid targetTravelerId,
        Guid sourceTravelerId,
        DateTimeOffset now);

    int TravelerCount { get; }
    int DocumentVersionCount { get; }
}
