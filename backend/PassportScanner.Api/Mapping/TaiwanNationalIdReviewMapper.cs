using System.Globalization;
using PassportScanner.Api.Contracts;
using PassportScanner.Api.Persistence;

namespace PassportScanner.Api.Mapping;

public static class TaiwanNationalIdReviewMapper
{
    public static ReviewedDocumentInput ToDocumentInput(
        TaiwanNationalIdReviewRequest request)
    {
        return new ReviewedDocumentInput(
            DocumentType: "TAIWAN_NATIONAL_ID",
            ChineseName: request.ChineseName,
            ChineseNameOnDocument: request.ChineseName,
            EnglishName: string.Empty,
            BirthDate: DateOnly.ParseExact(
                request.BirthDate,
                "yyyy-MM-dd",
                CultureInfo.InvariantCulture),
            Sex: request.Sex,
            Nationality: null,
            DocumentNumber:
                request.NationalId.Trim().ToUpperInvariant(),
            IssuingCountry: null,
            ExpiryDate: null,
            VerifiedAt: request.ReviewedAt);
    }
}
