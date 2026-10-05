using System.Globalization;
using PassportScanner.Api.Contracts;
using PassportScanner.Api.Persistence;

namespace PassportScanner.Api.Mapping;

public static class TaiwanCompatriotPermitReviewMapper
{
    public static ReviewedDocumentInput ToDocumentInput(
        TaiwanCompatriotPermitReviewRequest request)
    {
        return new ReviewedDocumentInput(
            DocumentType: "TAIWAN_COMPATRIOT_PERMIT",
            ChineseName: request.ChineseName,
            ChineseNameOnDocument: request.ChineseName,
            EnglishName: string.Empty,
            BirthDate: DateOnly.ParseExact(
                request.BirthDate,
                "yyyy-MM-dd",
                CultureInfo.InvariantCulture),
            Sex: request.Sex,
            Nationality: null,
            DocumentNumber: request.PermitNumber,
            IssuingCountry: null,
            ExpiryDate: DateOnly.ParseExact(
                request.ExpiryDate,
                "yyyy-MM-dd",
                CultureInfo.InvariantCulture),
            VerifiedAt: request.ReviewedAt);
    }
}
