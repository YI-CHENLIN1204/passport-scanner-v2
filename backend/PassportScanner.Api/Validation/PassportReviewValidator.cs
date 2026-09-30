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
            Add(nameof(request.SchemaVersion), "不支援的資料版本。");

        if (!string.Equals(
                request.DocumentType,
                "passport",
                StringComparison.Ordinal))
        {
            Add(nameof(request.DocumentType), "證件類型必須為 passport。");
        }

        if (string.IsNullOrWhiteSpace(request.EnglishName) ||
            !EnglishNameRegex().IsMatch(request.EnglishName.Trim()))
        {
            Add(nameof(request.EnglishName), "英文姓名格式不正確。");
        }

        if (string.IsNullOrWhiteSpace(request.PassportNumber) ||
            !PassportNumberRegex().IsMatch(request.PassportNumber.Trim()))
        {
            Add(nameof(request.PassportNumber), "護照號碼格式不正確。");
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
            Add(nameof(request.BirthDate), "出生日期不可晚於今天。");

        if (request.Sex is not ("" or "M" or "F" or "X"))
            Add(nameof(request.Sex), "性別必須為空白、M、F 或 X。");

        if (!string.Equals(
                request.Ocr.Engine,
                "paddleocr-ppocrv5",
                StringComparison.Ordinal))
        {
            Add("ocr.engine", "OCR 引擎資訊不符合目前護照流程。");
        }

        if (request.Ocr.AverageScore is < 0 or > 1)
            Add("ocr.averageScore", "OCR 平均信心值必須介於 0 到 1。");

        if (request.ReviewedAt > DateTimeOffset.UtcNow.AddMinutes(5))
            Add(nameof(request.ReviewedAt), "覆核時間不可晚於目前時間。");

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
            warnings.Add("這本護照目前已過有效期限。");
        }

        if (request.Verification.PassportNumberCheckDigit != true ||
            request.Verification.BirthDateCheckDigit != true ||
            request.Verification.ExpiryDateCheckDigit != true ||
            request.Verification.CompositeCheckDigit != true)
        {
            warnings.Add("至少一個 MRZ 檢查碼未通過。");
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

        addError(field, "日期必須使用 YYYY-MM-DD。");
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
            addError(field, "國家代碼必須為 3 碼大寫英文字母。");
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
