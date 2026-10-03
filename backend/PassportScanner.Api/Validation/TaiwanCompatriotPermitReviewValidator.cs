using System.Globalization;
using System.Text.RegularExpressions;
using PassportScanner.Api.Contracts;

namespace PassportScanner.Api.Validation;

public static partial class TaiwanCompatriotPermitReviewValidator
{
    public static Dictionary<string, string[]> Validate(
        TaiwanCompatriotPermitReviewRequest request,
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
                "taiwan-compatriot-permit",
                StringComparison.Ordinal))
        {
            Add(
                nameof(request.DocumentType),
                "證件類型必須為 taiwan-compatriot-permit。");
        }

        if (string.IsNullOrWhiteSpace(request.ChineseName) ||
            !ChineseNameRegex().IsMatch(request.ChineseName.Trim()))
        {
            Add(
                nameof(request.ChineseName),
                "中文姓名不可空白，且應使用中文姓名字元。");
        }

        if (!PermitNumberRegex().IsMatch(request.PermitNumber.Trim()))
        {
            Add(
                nameof(request.PermitNumber),
                "台胞證號碼必須為 8 位數字；簽發次數不屬於證件號碼。");
        }

        var birthDate = ParseDate(
            request.BirthDate,
            nameof(request.BirthDate),
            Add);

        var expiryDate = ParseDate(
            request.ExpiryDate,
            nameof(request.ExpiryDate),
            Add);

        if (birthDate is not null && birthDate > today)
        {
            Add(
                nameof(request.BirthDate),
                "出生日期不可晚於今天。");
        }

        if (birthDate is not null &&
            expiryDate is not null &&
            expiryDate <= birthDate)
        {
            Add(
                nameof(request.ExpiryDate),
                "有效期限必須晚於出生日期。");
        }

        if (request.Sex is not ("" or "M" or "F" or "X"))
        {
            Add(
                nameof(request.Sex),
                "性別必須為空白、M、F 或 X。");
        }

        if (!request.ReviewAssertions.AllFieldsVisuallyConfirmed)
        {
            Add(
                "reviewAssertions.allFieldsVisuallyConfirmed",
                "即使台胞證機讀碼檢查通過，儲存前仍必須人工核對姓名與證件欄位。");
        }

        if (!string.Equals(
                request.Ocr.Engine,
                "paddleocr-ppocrv5",
                StringComparison.Ordinal))
        {
            Add(
                "ocr.engine",
                "OCR 引擎資訊不符合目前台胞證流程。");
        }

        if (request.Ocr.ExtractedFieldCount is < 0 or > 5)
        {
            Add(
                "ocr.extractedFieldCount",
                "OCR 欄位數資訊不正確。");
        }

        if (request.Ocr.AverageScore is < 0 or > 1)
        {
            Add(
                "ocr.averageScore",
                "OCR 平均信心值必須介於 0 到 1。");
        }

        if (request.ReviewedAt > DateTimeOffset.UtcNow.AddMinutes(5))
        {
            Add(
                nameof(request.ReviewedAt),
                "覆核時間不可晚於目前時間。");
        }

        return errors.ToDictionary(
            pair => ToCamelCase(pair.Key),
            pair => pair.Value.ToArray(),
            StringComparer.OrdinalIgnoreCase);
    }

    public static IReadOnlyList<string> GetWarnings(
        TaiwanCompatriotPermitReviewRequest request,
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
            warnings.Add("這張台胞證目前已過有效期限。");
        }

        if (request.Ocr.ExtractedFieldCount < 4)
        {
            warnings.Add("部分欄位由人工補填，請保留人工覆核結果。");
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

    private static string ToCamelCase(string value) =>
        string.IsNullOrEmpty(value)
            ? value
            : char.ToLowerInvariant(value[0]) + value[1..];

    [GeneratedRegex(
        @"^[\p{IsCJKUnifiedIdeographs}·‧ ]{2,20}$",
        RegexOptions.CultureInvariant)]
    private static partial Regex ChineseNameRegex();

    [GeneratedRegex(@"^\d{8}$", RegexOptions.CultureInvariant)]
    private static partial Regex PermitNumberRegex();
}
