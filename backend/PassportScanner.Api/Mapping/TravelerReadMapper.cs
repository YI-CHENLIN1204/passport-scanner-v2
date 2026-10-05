using PassportScanner.Api.Contracts;
using PassportScanner.Api.Persistence;

namespace PassportScanner.Api.Mapping;

public static class TravelerReadMapper
{
    public static TravelerSummaryResponse ToResponse(
        TravelerSummary traveler)
    {
        return new TravelerSummaryResponse(
            traveler.TravelerId,
            traveler.NameZh,
            traveler.NameEn,
            traveler.BirthDate.ToString("yyyy-MM-dd"),
            traveler.Gender,
            traveler.Nationality,
            traveler.NationalIdNumber,
            traveler.DocumentVersionCount,
            traveler.CurrentDocumentTypes);
    }

    public static TravelerDetailResponse ToResponse(
        TravelerDetail detail)
    {
        return new TravelerDetailResponse(
            ToResponse(detail.Traveler),
            detail.Documents
                .Select(document =>
                    new DocumentVersionResponse(
                        document.DocumentVersionId,
                        document.DocumentType,
                        document.NameZhOnDocument,
                        document.NameEnOnDocument,
                        document.DocumentNumber,
                        document.IssuingCountry,
                        document.Nationality,
                        document.ExpiryDate?.ToString("yyyy-MM-dd"),
                        document.IsCurrent,
                        document.VerifiedAt,
                        document.CreatedAt))
                .ToList());
    }
}
