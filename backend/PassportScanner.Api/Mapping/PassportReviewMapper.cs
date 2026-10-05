using System.Globalization;
using PassportScanner.Api.Contracts;
using PassportScanner.Api.Persistence;

namespace PassportScanner.Api.Mapping;

public static class PassportReviewMapper
{
    public static ReviewedDocumentInput ToDocumentInput(
        PassportReviewRequest request)
    {
        return new ReviewedDocumentInput(
            DocumentType: "PASSPORT",
            ChineseName: request.ChineseName,
            ChineseNameOnDocument: request.ChineseName,
            EnglishName: request.EnglishName,
            BirthDate: DateOnly.ParseExact(
                request.BirthDate,
                "yyyy-MM-dd",
                CultureInfo.InvariantCulture),
            Sex: request.Sex,
            Nationality: request.Nationality,
            NationalIdNumber: null,
            DocumentNumber: request.PassportNumber,
            IssuingCountry: request.IssuingState,
            ExpiryDate: DateOnly.ParseExact(
                request.ExpiryDate,
                "yyyy-MM-dd",
                CultureInfo.InvariantCulture),
            VerifiedAt: request.ReviewedAt);
    }
}
