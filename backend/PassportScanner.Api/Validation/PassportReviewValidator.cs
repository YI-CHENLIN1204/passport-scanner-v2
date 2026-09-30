using System.Globalization;
using System.Text.RegularExpressions;
using PassportScanner.Api.Contracts;

namespace PassportScanner.Api.Validation;

public static partial class PassportReviewValidator
{
    public static Dictionary<string, string[]> Validate(
        PassportReviewRequest request,
        DateOnly today)
    {
        var errors = new Dictionary<string, List<string>>(
            StringComparer.OrdinalIgnoreCase);

        void Add(string field, string message)
        {
            if (!errors.TryGetValue(field, out var list))
            {
                list = [];
                errors[field] = list;
            }

            list.Add(message);
        }

        if (request.SchemaVersion != 1)
            Add(nameof(request.SchemaVersion), "Unsupported schema version.");

        if (!string.Equals(
                request.DocumentType,
                "passport",
                StringComparison.Ordinal))
        {
            Add(nameof(request.DocumentType), "Document type must be passport.");
        }

        if (string.IsNullOrWhiteSpace(request.EnglishName) ||
            !EnglishNameRegex().IsMatch(request.EnglishName.Trim()))
        {
            Add(nameof(request.EnglishName), "English name format is invalid.");
        }

        if (string.IsNullOrWhiteSpace(request.PassportNumber) ||
            !PassportNumberRegex().IsMatch(request.PassportNumber.Trim()))
        {
            Add(nameof(request.PassportNumber), "Passport number format is invalid.");
        }

        ValidateCountryCode(
            request.Nationality,
            nameof(request.Nationality),
            Add);

        ValidateCountryCode(
            request.IssuingState,
            nameof(request.IssuingState),
            Add);

        var birthDate = ParseDate(
            request.BirthDate,
            nameof(request.BirthDate),
            Add);

        var expiryDate = ParseDate(
            request.ExpiryDate,
            nameof(request.ExpiryDate),
            Add);

        if (birthDate is not null && birthDate > today)
            Add(nameof(request.BirthDate), "Birth date cannot be in the future.");

        if (request.Sex is not ("" or "M" or "F" or "X"))
            Add(nameof(request.Sex), "Sex must be empty, M, F, or X.");

        if (!string.Equals(
                request.Ocr.Engine,
                "paddleocr-ppocrv5",
                StringComparison.Ordinal))
        {
            Add("ocr.engine", "Unexpected OCR engine.");
        }

        if (request.Ocr.AverageScore is < 0 or > 1)
            Add("ocr.averageScore", "Average OCR score must be between 0 and 1.");

        if (request.ReviewedAt > DateTimeOffset.UtcNow.AddMinutes(5))
            Add(nameof(request.ReviewedAt), "Reviewed time cannot be in the future.");

        return errors.ToDictionary(
            pair => ToCamelCase(pair.Key),
            pair => pair.Value.ToArray(),
            StringComparer.OrdinalIgnoreCase);
    }

    public static IReadOnlyList<string> GetWarnings(
        PassportReviewRequest request,
        DateOnly today)
    {
        var warnings = new List<string>();

        if (DateOnly.TryParseExact(
                request.ExpiryDate,
                "yyyy-MM-dd",
                CultureInfo.InvariantCulture,
                DateTimeStyles.None,
                out var expiryDate) &&
            expiryDate < today)
        {
            warnings.Add("Passport is expired.");
        }

        if (request.Verification.PassportNumberCheckDigit != true ||
            request.Verification.BirthDateCheckDigit != true ||
            request.Verification.ExpiryDateCheckDigit != true ||
            request.Verification.CompositeCheckDigit != true)
        {
            warnings.Add("One or more MRZ check digits were not verified.");
        }

        return warnings;
    }

    private static DateOnly? ParseDate(
        string value,
        string field,
        Action<string, string> addError)
    {
        if (DateOnly.TryParseExact(
                value,
                "yyyy-MM-dd",
                CultureInfo.InvariantCulture,
                DateTimeStyles.None,
                out var parsed))
        {
            return parsed;
        }

        addError(field, "Date must use YYYY-MM-DD.");
        return null;
    }

    private static void ValidateCountryCode(
        string value,
        string field,
        Action<string, string> addError)
    {
        if (string.IsNullOrWhiteSpace(value) ||
            !CountryCodeRegex().IsMatch(value.Trim()))
        {
            addError(field, "Country code must be exactly 3 uppercase letters.");
        }
    }

    private static string ToCamelCase(string value) =>
        string.IsNullOrEmpty(value)
            ? value
            : char.ToLowerInvariant(value[0]) + value[1..];

    [GeneratedRegex("^[A-Z][A-Z .,'-]*$", RegexOptions.CultureInvariant)]
    private static partial Regex EnglishNameRegex();

    [GeneratedRegex("^[A-Z0-9]{5,20}$", RegexOptions.CultureInvariant)]
    private static partial Regex PassportNumberRegex();

    [GeneratedRegex("^[A-Z]{3}$", RegexOptions.CultureInvariant)]
    private static partial Regex CountryCodeRegex();
}
