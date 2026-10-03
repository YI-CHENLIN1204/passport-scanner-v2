using System.Globalization;
using System.Text.RegularExpressions;
using PassportScanner.Api.Contracts;

namespace PassportScanner.Api.Validation;

public static partial class TaiwanNationalIdReviewValidator
{
    private static readonly IReadOnlyDictionary<char, int> AreaCodes =
        new Dictionary<char, int>
        {
            ['A'] = 10, ['B'] = 11, ['C'] = 12, ['D'] = 13,
            ['E'] = 14, ['F'] = 15, ['G'] = 16, ['H'] = 17,
            ['I'] = 34, ['J'] = 18, ['K'] = 19, ['L'] = 20,
            ['M'] = 21, ['N'] = 22, ['O'] = 35, ['P'] = 23,
            ['Q'] = 24, ['R'] = 25, ['S'] = 26, ['T'] = 27,
            ['U'] = 28, ['V'] = 29, ['W'] = 32, ['X'] = 30,
            ['Y'] = 31, ['Z'] = 33
        };

    public static Dictionary<string, string[]> Validate(
        TaiwanNationalIdReviewRequest request,
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
                "tw-id",
                StringComparison.Ordinal))
        {
            Add(
                nameof(request.DocumentType),
                "證件類型必須為 tw-id。");
        }

        if (string.IsNullOrWhiteSpace(request.ChineseName) ||
            !ChineseNameRegex().IsMatch(request.ChineseName.Trim()))
        {
            Add(
                nameof(request.ChineseName),
                "中文姓名不可空白，且應使用中文姓名字元。");
        }

        var nationalId =
            request.NationalId.Trim().ToUpperInvariant();

        if (!NationalIdRegex().IsMatch(nationalId))
        {
            Add(
                nameof(request.NationalId),
                "國民身分證統一編號必須為 1 碼英文加 9 碼數字，第 2 碼為 1 或 2。");
        }
        else if (!IsValidNationalId(nationalId))
        {
            Add(
                nameof(request.NationalId),
                "國民身分證統一編號檢查碼失敗。");
        }

        var birthDate = ParseDate(
            request.BirthDate,
            nameof(request.BirthDate),
            Add);

        if (birthDate is not null && birthDate > today)
        {
            Add(
                nameof(request.BirthDate),
                "出生日期不可晚於今天。");
        }

        if (request.Sex is not ("M" or "F"))
        {
            Add(
                nameof(request.Sex),
                "國民身分證性別必須為 M 或 F。");
        }
        else if (NationalIdRegex().IsMatch(nationalId))
        {
            var expectedSex =
                nationalId[1] == '1' ? "M" : "F";

            if (request.Sex != expectedSex)
            {
                Add(
                    nameof(request.Sex),
                    "性別與國民身分證統一編號第 2 碼不一致。");
            }
        }

        if (!request.ReviewAssertions.AllFieldsVisuallyConfirmed)
        {
            Add(
                "reviewAssertions.allFieldsVisuallyConfirmed",
                "儲存前必須人工核對姓名、身分證字號與出生日期。");
        }

        if (!string.Equals(
                request.Ocr.Engine,
                "paddleocr-ppocrv5",
                StringComparison.Ordinal))
        {
            Add(
                "ocr.engine",
                "OCR 引擎資訊不符合目前身分證流程。");
        }

        if (request.Ocr.ExtractedFieldCount is < 0 or > 4)
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
        TaiwanNationalIdReviewRequest request)
    {
        var warnings = new List<string>();

        if (request.Ocr.ExtractedFieldCount < 3)
        {
            warnings.Add("部分身分證欄位由人工補填，請保留人工覆核結果。");
        }

        return warnings;
    }

    public static bool IsValidNationalId(string value)
    {
        var nationalId = value.Trim().ToUpperInvariant();

        if (!NationalIdRegex().IsMatch(nationalId))
            return false;

        if (!AreaCodes.TryGetValue(nationalId[0], out var area))
            return false;

        var sum =
            (area / 10) +
            (area % 10) * 9;

        var weights = new[] { 8, 7, 6, 5, 4, 3, 2, 1 };

        for (var index = 0; index < 8; index++)
        {
            sum +=
                (nationalId[index + 1] - '0') *
                weights[index];
        }

        sum += nationalId[9] - '0';

        return sum % 10 == 0;
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

    [GeneratedRegex(
        @"^[A-Z][12]\d{8}$",
        RegexOptions.CultureInvariant)]
    private static partial Regex NationalIdRegex();
}
