using System.Globalization;
using System.Text;
using Microsoft.EntityFrameworkCore;
using PassportScanner.Api.Contracts;
using PassportScanner.Api.Domain;

namespace PassportScanner.Api.Persistence;

public sealed class PostgresTourStore(
    PassportScannerDbContext db)
    : ITourStore
{
    private static readonly HashSet<string> AllowedDocumentTypes =
        new(StringComparer.Ordinal)
        {
            "PASSPORT",
            "TAIWAN_COMPATRIOT_PERMIT",
            "TAIWAN_NATIONAL_ID"
        };
    public IReadOnlyList<TourSummaryResponse> ListTours(
        string? query)
    {
        var trimmed = query?.Trim() ?? string.Empty;
        var tours = db.Tours.AsNoTracking();

        if (!string.IsNullOrWhiteSpace(trimmed))
        {
            tours = tours.Where(
                item => item.TourName.Contains(trimmed));
        }

        return tours
            .OrderByDescending(item => item.DepartureDate)
            .ThenByDescending(item => item.CreatedAt)
            .ToList()
            .Select(ToSummary)
            .ToList();
    }

    public TourDetailResponse? GetTour(Guid tourId)
    {
        var tour = db.Tours
            .AsNoTracking()
            .SingleOrDefault(item => item.TourId == tourId);

        if (tour is null)
        {
            return null;
        }

        var memberships = db.TourMembers
            .AsNoTracking()
            .Where(item => item.TourId == tourId)
            .OrderBy(item => item.CreatedAt)
            .ToList();

        var travelerIds = memberships
            .Select(item => item.TravelerId)
            .Distinct()
            .ToList();

        var travelers = db.Travelers
            .AsNoTracking()
            .Where(item => travelerIds.Contains(item.TravelerId))
            .ToDictionary(item => item.TravelerId);

        var requiredDocumentTypes = tour.RequiredDocumentTypes;

        var documents = db.DocumentVersions
            .AsNoTracking()
            .Where(item =>
                travelerIds.Contains(item.TravelerId) &&
                requiredDocumentTypes.Contains(item.DocumentType))
            .OrderByDescending(item => item.IsCurrent)
            .ThenByDescending(item => item.CreatedAt)
            .ToList();

        var members = memberships
            .Where(item => travelers.ContainsKey(item.TravelerId))
            .Select(item =>
            {
                var traveler = travelers[item.TravelerId];
                var memberDocuments = documents
                    .Where(document =>
                        document.TravelerId == item.TravelerId &&
                        document.IsCurrent)
                    .Select(document =>
                        new TourMemberDocumentResponse(
                            document.DocumentVersionId,
                            document.DocumentType,
                            document.NameZhOnDocument,
                            document.NameEnOnDocument,
                            document.DocumentNumber,
                            document.IssuingCountry,
                            document.Nationality,
                            document.ExpiryDate,
                            document.IsCurrent,
                            document.VerifiedAt))
                    .ToList();

                return new TourMemberResponse(
                    item.TourMemberId,
                    traveler.TravelerId,
                    traveler.NameZh,
                    traveler.NameEn,
                    traveler.BirthDate,
                    traveler.Gender,
                    traveler.Nationality,
                    traveler.NationalIdNumber,
                    memberDocuments);
            })
            .ToList();

        return new TourDetailResponse(
            ToSummary(tour),
            members);
    }

    public TourSummaryResponse CreateTour(
        CreateTourRequest request,
        DateTimeOffset now)
    {
        var name = request.TourName.Trim();

        if (string.IsNullOrWhiteSpace(name))
        {
            throw new ArgumentException("團別名稱不可空白。");
        }

        if (request.ReturnDate < request.DepartureDate)
        {
            throw new ArgumentException("回國日不可早於出發日。");
        }

        var requiredDocumentTypes =
            (request.RequiredDocumentTypes ?? Array.Empty<string>())
            .Select(item => item.Trim().ToUpperInvariant())
            .Where(item => !string.IsNullOrWhiteSpace(item))
            .Distinct(StringComparer.Ordinal)
            .ToArray();

        if (requiredDocumentTypes.Length == 0)
        {
            throw new ArgumentException("請至少選擇一種此團需要的證件。");
        }

        if (requiredDocumentTypes.Any(item => !AllowedDocumentTypes.Contains(item)))
        {
            throw new ArgumentException("包含不支援的團別證件類型。");
        }

        var tour = new TourRecord
        {
            TourId = Guid.NewGuid(),
            TourName = name,
            DepartureDate = request.DepartureDate,
            ReturnDate = request.ReturnDate,
            RequiredDocumentTypes = requiredDocumentTypes,
            CreatedAt = now,
            UpdatedAt = now
        };

        db.Tours.Add(tour);
        db.SaveChanges();

        return ToSummary(tour);
    }

    public TourSummaryResponse? UpdateTour(
        Guid tourId,
        UpdateTourRequest request,
        DateTimeOffset now)
    {
        var tour = db.Tours.SingleOrDefault(
            item => item.TourId == tourId);

        if (tour is null)
        {
            return null;
        }

        var name = request.TourName.Trim();

        if (string.IsNullOrWhiteSpace(name))
        {
            throw new ArgumentException("團別名稱不可空白。");
        }

        if (request.ReturnDate < request.DepartureDate)
        {
            throw new ArgumentException("回國日不可早於出發日。");
        }

        var requiredDocumentTypes =
            (request.RequiredDocumentTypes ?? Array.Empty<string>())
            .Select(item => item.Trim().ToUpperInvariant())
            .Where(item => !string.IsNullOrWhiteSpace(item))
            .Distinct(StringComparer.Ordinal)
            .ToArray();

        if (requiredDocumentTypes.Length == 0)
        {
            throw new ArgumentException("請至少選擇一種此團需要的證件。");
        }

        if (requiredDocumentTypes.Any(
            item => !AllowedDocumentTypes.Contains(item)))
        {
            throw new ArgumentException("包含不支援的團別證件類型。");
        }

        var removedTypes = tour.RequiredDocumentTypes
            .Except(requiredDocumentTypes, StringComparer.Ordinal)
            .ToArray();

        if (removedTypes.Length > 0)
        {
            var draftIds = db.TourPersonDrafts
                .Where(item => item.TourId == tourId)
                .Select(item => item.DraftPersonId)
                .ToList();

            var hasStaged = db.ScanItems.Any(item =>
                draftIds.Contains(item.DraftPersonId) &&
                removedTypes.Contains(item.DocumentType));

            var travelerIds = db.TourMembers
                .Where(item => item.TourId == tourId)
                .Select(item => item.TravelerId)
                .ToList();

            var hasFormal = db.DocumentVersions.Any(item =>
                travelerIds.Contains(item.TravelerId) &&
                item.IsCurrent &&
                removedTypes.Contains(item.DocumentType));

            if (hasStaged || hasFormal)
            {
                throw new ArgumentException(
                    "已有收件資料的證件類型不能直接從團別需求中移除。");
            }
        }

        tour.TourName = name;
        tour.DepartureDate = request.DepartureDate;
        tour.ReturnDate = request.ReturnDate;
        tour.RequiredDocumentTypes = requiredDocumentTypes;
        tour.UpdatedAt = now;

        var deleteAfter = new DateTimeOffset(
            request.ReturnDate
                .AddDays(8)
                .ToDateTime(
                    TimeOnly.MinValue,
                    DateTimeKind.Utc));

        var tourDraftIds = db.TourPersonDrafts
            .Where(item => item.TourId == tourId)
            .Select(item => item.DraftPersonId)
            .ToList();

        var scanItems = db.ScanItems
            .Where(item => tourDraftIds.Contains(item.DraftPersonId))
            .ToList();

        foreach (var item in scanItems)
        {
            item.DeleteAfter = deleteAfter;
            item.UpdatedAt = now;
        }

        db.SaveChanges();

        return ToSummary(tour);
    }

    public bool EnsureMember(
        Guid tourId,
        Guid travelerId,
        DateTimeOffset now)
    {
        if (!db.Tours.Any(item => item.TourId == tourId))
        {
            return false;
        }

        var exists = db.TourMembers.Any(item =>
            item.TourId == tourId &&
            item.TravelerId == travelerId);

        if (!exists)
        {
            db.TourMembers.Add(
                new TourMemberRecord
                {
                    TourMemberId = Guid.NewGuid(),
                    TourId = tourId,
                    TravelerId = travelerId,
                    CreatedAt = now
                });
        }

        var tour = db.Tours.Single(
            item => item.TourId == tourId);
        tour.UpdatedAt = now;

        db.SaveChanges();
        return true;
    }

    public byte[] ExportCsv(Guid tourId)
    {
        var detail = GetTour(tourId)
            ?? throw new KeyNotFoundException("找不到指定團別。");

        static string Csv(string? value)
        {
            var text = value ?? string.Empty;
            return $"\"{text.Replace("\"", "\"\"")}\"";
        }

        var headers = new List<string>
        {
            "中文姓名",
            "英文姓名",
            "出生日期",
            "性別",
            "國籍"
        };

        foreach (var type in detail.Tour.RequiredDocumentTypes)
        {
            switch (type)
            {
                case "PASSPORT":
                    headers.Add("護照號碼");
                    headers.Add("護照有效期限");
                    break;
                case "TAIWAN_COMPATRIOT_PERMIT":
                    headers.Add("台胞證號碼");
                    headers.Add("台胞證有效期限");
                    break;
                case "TAIWAN_NATIONAL_ID":
                    headers.Add("身分證字號");
                    break;
            }
        }

        var builder = new StringBuilder();
        builder.AppendLine(string.Join(",", headers));

        foreach (var member in detail.Members)
        {
            var values = new List<string>
            {
                Csv(member.NameZh),
                Csv(member.NameEn),
                Csv(member.BirthDate.ToString(
                    "yyyy-MM-dd",
                    CultureInfo.InvariantCulture)),
                Csv(member.Gender),
                Csv(member.Nationality)
            };

            foreach (var type in detail.Tour.RequiredDocumentTypes)
            {
                var document = member.Documents.FirstOrDefault(
                    item => item.DocumentType == type);

                switch (type)
                {
                    case "PASSPORT":
                    case "TAIWAN_COMPATRIOT_PERMIT":
                        values.Add(Csv(document?.DocumentNumber));
                        values.Add(Csv(document?.ExpiryDate?.ToString(
                            "yyyy-MM-dd",
                            CultureInfo.InvariantCulture)));
                        break;
                    case "TAIWAN_NATIONAL_ID":
                        values.Add(Csv(document?.DocumentNumber));
                        break;
                }
            }

            builder.AppendLine(string.Join(",", values));
        }

        return Encoding.UTF8.GetPreamble()
            .Concat(Encoding.UTF8.GetBytes(builder.ToString()))
            .ToArray();
    }
    private TourSummaryResponse ToSummary(TourRecord tour)
    {
        var memberships = db.TourMembers
            .AsNoTracking()
            .Where(item => item.TourId == tour.TourId)
            .ToList();

        var travelerIds = memberships
            .Select(item => item.TravelerId)
            .Distinct()
            .ToList();

        var travelers = db.Travelers
            .AsNoTracking()
            .Where(item => travelerIds.Contains(item.TravelerId))
            .ToList();

        var requiredDocumentTypes = tour.RequiredDocumentTypes;

        var formalDocuments = db.DocumentVersions
            .AsNoTracking()
            .Where(item =>
                travelerIds.Contains(item.TravelerId) &&
                item.IsCurrent &&
                requiredDocumentTypes.Contains(item.DocumentType))
            .ToList();

        var drafts = db.TourPersonDrafts
            .AsNoTracking()
            .Where(item => item.TourId == tour.TourId)
            .ToList();

        var draftIds = drafts
            .Select(item => item.DraftPersonId)
            .ToList();

        var stagedItems = db.ScanItems
            .AsNoTracking()
            .Where(item => draftIds.Contains(item.DraftPersonId))
            .ToList();

        var personKeys = new HashSet<string>(
            StringComparer.Ordinal);

        var travelerKeys = travelers.ToDictionary(
            item => item.TravelerId,
            item => IdentityKey(
                item.NameZh,
                item.BirthDate,
                item.Gender,
                item.TravelerId));

        foreach (var key in travelerKeys.Values)
        {
            personKeys.Add(key);
        }

        var draftKeys = drafts.ToDictionary(
            item => item.DraftPersonId,
            item => item.BirthDate.HasValue
                ? IdentityKey(
                    item.NameZh,
                    item.BirthDate.Value,
                    item.Gender,
                    item.DraftPersonId)
                : $"DRAFT:{item.DraftPersonId:N}");

        foreach (var key in draftKeys.Values)
        {
            personKeys.Add(key);
        }

        var receivedDocuments = new HashSet<string>(
            StringComparer.Ordinal);

        foreach (var document in formalDocuments)
        {
            if (!travelerKeys.TryGetValue(
                document.TravelerId,
                out var personKey))
            {
                continue;
            }

            receivedDocuments.Add(
                $"{personKey}|{document.DocumentType}");
        }

        foreach (var item in stagedItems)
        {
            if (!draftKeys.TryGetValue(
                item.DraftPersonId,
                out var personKey))
            {
                continue;
            }

            receivedDocuments.Add(
                $"{personKey}|{item.DocumentType}");
        }

        var pendingReviewCount = stagedItems.Count(
            item => item.ReviewStatus == "PENDING");

        return new TourSummaryResponse(
            tour.TourId,
            tour.TourName,
            tour.DepartureDate,
            tour.ReturnDate,
            tour.RequiredDocumentTypes,
            memberships.Count,
            formalDocuments.Count,
            personKeys.Count,
            receivedDocuments.Count,
            pendingReviewCount,
            tour.UpdatedAt);
    }

    private static string IdentityKey(
        string nameZh,
        DateOnly birthDate,
        string gender,
        Guid fallbackId)
    {
        var normalizedName = string.Concat(
            nameZh.Trim().Where(
                character => !char.IsWhiteSpace(character)));
        var normalizedGender =
            gender.Trim().ToUpperInvariant();

        if (
            string.IsNullOrWhiteSpace(normalizedName) ||
            string.IsNullOrWhiteSpace(normalizedGender))
        {
            return $"ROW:{fallbackId:N}";
        }

        return string.Join(
            "|",
            normalizedName,
            birthDate.ToString(
                "yyyy-MM-dd",
                CultureInfo.InvariantCulture),
            normalizedGender);
    }

}
