using System.Globalization;
using System.Text;
using Microsoft.EntityFrameworkCore;
using PassportScanner.Api.Contracts;
using PassportScanner.Api.Domain;
using PassportScanner.Api.Services;

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
        string? query,
        string? status,
        string? documentType,
        DateOnly? departureFrom,
        DateOnly? departureTo)
    {
        var trimmed = query?.Trim() ?? string.Empty;
        var normalizedStatus =
            status?.Trim().ToLowerInvariant();
        var normalizedDocumentType =
            documentType?.Trim().ToUpperInvariant();

        if (
            !string.IsNullOrWhiteSpace(normalizedStatus) &&
            normalizedStatus is not
                ("empty" or "progress" or "pending" or "complete"))
        {
            throw new ArgumentException(
                "不支援的團別狀態。",
                nameof(status));
        }

        if (
            !string.IsNullOrWhiteSpace(normalizedDocumentType) &&
            !AllowedDocumentTypes.Contains(
                normalizedDocumentType))
        {
            throw new ArgumentException(
                "不支援的證件類別。",
                nameof(documentType));
        }

        if (
            departureFrom.HasValue &&
            departureTo.HasValue &&
            departureTo.Value < departureFrom.Value)
        {
            throw new ArgumentException(
                "出發日期結束日不可早於開始日。");
        }

        var tours = db.Tours.AsNoTracking();

        if (!string.IsNullOrWhiteSpace(trimmed))
        {
            tours = tours.Where(
                item => item.TourName.Contains(trimmed));
        }

        if (!string.IsNullOrWhiteSpace(normalizedDocumentType))
        {
            tours = tours.Where(
                item =>
                    item.RequiredDocumentTypes.Contains(
                        normalizedDocumentType));
        }

        if (departureFrom.HasValue)
        {
            tours = tours.Where(
                item =>
                    item.DepartureDate >=
                        departureFrom.Value);
        }

        if (departureTo.HasValue)
        {
            tours = tours.Where(
                item =>
                    item.DepartureDate <=
                        departureTo.Value);
        }

        var summaries = tours
            .OrderByDescending(
                item => item.DepartureDate)
            .ThenByDescending(
                item => item.CreatedAt)
            .ToList()
            .Select(ToSummary)
            .ToList();

        if (string.IsNullOrWhiteSpace(normalizedStatus))
        {
            return summaries;
        }

        return summaries
            .Where(item =>
                CollectionStatus(item) ==
                    normalizedStatus)
            .ToList();
    }

    private static string CollectionStatus(
        TourSummaryResponse tour)
    {
        var expected =
            tour.MemberCount *
            tour.RequiredDocumentTypes.Count;

        if (tour.MemberCount == 0)
        {
            return "empty";
        }

        if (tour.PendingReviewCount > 0)
        {
            return "pending";
        }

        if (
            expected > 0 &&
            tour.ReceivedDocumentCount >= expected)
        {
            return "complete";
        }

        return "progress";
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

        var memberIds = memberships
            .Select(item => item.TourMemberId)
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

        var memberDocumentLinks = db.TourMemberDocuments
            .AsNoTracking()
            .Where(item =>
                memberIds.Contains(item.TourMemberId) &&
                requiredDocumentTypes.Contains(item.DocumentType))
            .OrderBy(item => item.CreatedAt)
            .ToList();

        var documentIds = memberDocumentLinks
            .Select(item => item.DocumentVersionId)
            .Distinct()
            .ToList();

        var documents = db.DocumentVersions
            .AsNoTracking()
            .Where(item =>
                documentIds.Contains(item.DocumentVersionId))
            .ToDictionary(item => item.DocumentVersionId);

        var members = memberships
            .Where(item => travelers.ContainsKey(item.TravelerId))
            .Select(item =>
            {
                var traveler = travelers[item.TravelerId];

                var memberLinks = memberDocumentLinks
                    .Where(link =>
                        link.TourMemberId ==
                            item.TourMemberId &&
                        documents.ContainsKey(
                            link.DocumentVersionId))
                    .ToList();

                var identitySnapshot = memberLinks
                    .OrderByDescending(link =>
                        link.UpdatedAt)
                    .ThenByDescending(link =>
                        link.CreatedAt)
                    .FirstOrDefault();

                var memberDocuments = memberLinks
                    .Select(link =>
                    {
                        var document =
                            documents[link.DocumentVersionId];

                        return new TourMemberDocumentResponse(
                            link.DocumentVersionId,
                            link.DocumentType,
                            link.SnapshotNameZhOnDocument,
                            link.SnapshotNameEnOnDocument,
                            link.SnapshotDocumentNumber,
                            link.SnapshotIssuingCountry,
                            link.SnapshotDocumentNationality,
                            link.SnapshotExpiryDate,
                            document.IsCurrent,
                            link.SnapshotVerifiedAt);
                    })
                    .ToList();

                return new TourMemberResponse(
                    item.TourMemberId,
                    traveler.TravelerId,
                    identitySnapshot?.SnapshotNameZh ??
                        traveler.NameZh,
                    identitySnapshot?.SnapshotNameEn ??
                        traveler.NameEn,
                    identitySnapshot?.SnapshotBirthDate ??
                        traveler.BirthDate,
                    identitySnapshot?.SnapshotGender ??
                        traveler.Gender,
                    identitySnapshot?.SnapshotNationality ??
                        traveler.Nationality,
                    identitySnapshot?.SnapshotNationalIdNumber ??
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

            var memberIds = db.TourMembers
                .Where(item => item.TourId == tourId)
                .Select(item => item.TourMemberId)
                .ToList();

            var hasFormal = db.TourMemberDocuments.Any(item =>
                memberIds.Contains(item.TourMemberId) &&
                removedTypes.Contains(item.DocumentType));

            if (hasStaged || hasFormal)
            {
                throw new ArgumentException(
                    "已有收件資料的證件類型不能直接從團別需求中移除。");
            }
        }

        var deleteAfter =
            BusinessDate
                .ProductionPhotoDeleteAfter(
                    request.ReturnDate);

        var tourDraftIds = db.TourPersonDrafts
            .Where(item => item.TourId == tourId)
            .Select(item => item.DraftPersonId)
            .ToList();

        var scanItems = db.ScanItems
            .Where(item =>
                tourDraftIds.Contains(
                    item.DraftPersonId))
            .ToList();

        if (
            deleteAfter <= now &&
            scanItems.Any(item =>
                item.ReviewStatus == "PENDING" &&
                item.ImageBytes.Length > 0))
        {
            throw new ArgumentException(
                "新的回國日會讓尚未審核的證件照片立即超過保存期限；請先完成或刪除待審核資料，再修改回國日。");
        }

        tour.TourName = name;
        tour.DepartureDate = request.DepartureDate;
        tour.ReturnDate = request.ReturnDate;
        tour.RequiredDocumentTypes = requiredDocumentTypes;
        tour.UpdatedAt = now;

        foreach (var item in scanItems)
        {
            item.DeleteAfter = deleteAfter;
            item.UpdatedAt = now;
        }

        db.SaveChanges();

        return ToSummary(tour);
    }

    public bool EnsureMemberDocument(
        Guid tourId,
        Guid travelerId,
        Guid documentVersionId,
        string documentType,
        DateTimeOffset now,
        TourMemberDocumentSnapshotInput? snapshot = null)
    {
        var tour = db.Tours.SingleOrDefault(
            item => item.TourId == tourId);

        if (tour is null)
        {
            return false;
        }

        var normalizedDocumentType =
            documentType.Trim().ToUpperInvariant();

        if (!tour.RequiredDocumentTypes.Contains(
            normalizedDocumentType,
            StringComparer.Ordinal))
        {
            return false;
        }

        var document = db.DocumentVersions
            .SingleOrDefault(item =>
                item.DocumentVersionId ==
                    documentVersionId);

        if (
            document is null ||
            document.TravelerId != travelerId ||
            document.DocumentType !=
                normalizedDocumentType)
        {
            return false;
        }

        var traveler = db.Travelers
            .SingleOrDefault(item =>
                item.TravelerId == travelerId);

        if (traveler is null)
        {
            return false;
        }

        var effectiveSnapshot =
            snapshot ??
            new TourMemberDocumentSnapshotInput(
                traveler.NameZh,
                traveler.NameEn,
                traveler.BirthDate,
                traveler.Gender,
                traveler.Nationality,
                traveler.NationalIdNumber,
                document.NameZhOnDocument,
                document.NameEnOnDocument,
                document.DocumentNumber,
                document.IssuingCountry,
                document.Nationality,
                document.ExpiryDate,
                document.VerifiedAt);

        var membership = db.TourMembers
            .SingleOrDefault(item =>
                item.TourId == tourId &&
                item.TravelerId == travelerId);

        if (membership is null)
        {
            membership = new TourMemberRecord
            {
                TourMemberId = Guid.NewGuid(),
                TourId = tourId,
                TravelerId = travelerId,
                CreatedAt = now
            };

            db.TourMembers.Add(membership);
            db.SaveChanges();
        }

        var link = db.TourMemberDocuments
            .SingleOrDefault(item =>
                item.TourMemberId ==
                    membership.TourMemberId &&
                item.DocumentType ==
                    normalizedDocumentType);

        if (link is null)
        {
            db.TourMemberDocuments.Add(
                new TourMemberDocumentRecord
                {
                    TourMemberDocumentId =
                        Guid.NewGuid(),
                    TourMemberId =
                        membership.TourMemberId,
                    DocumentVersionId =
                        documentVersionId,
                    DocumentType =
                        normalizedDocumentType,
                    SnapshotNameZh =
                        effectiveSnapshot.NameZh,
                    SnapshotNameEn =
                        effectiveSnapshot.NameEn,
                    SnapshotBirthDate =
                        effectiveSnapshot.BirthDate,
                    SnapshotGender =
                        effectiveSnapshot.Gender,
                    SnapshotNationality =
                        effectiveSnapshot.Nationality,
                    SnapshotNationalIdNumber =
                        effectiveSnapshot.NationalIdNumber,
                    SnapshotNameZhOnDocument =
                        effectiveSnapshot.NameZhOnDocument,
                    SnapshotNameEnOnDocument =
                        effectiveSnapshot.NameEnOnDocument,
                    SnapshotDocumentNumber =
                        effectiveSnapshot.DocumentNumber,
                    SnapshotIssuingCountry =
                        effectiveSnapshot.IssuingCountry,
                    SnapshotDocumentNationality =
                        effectiveSnapshot.DocumentNationality,
                    SnapshotExpiryDate =
                        effectiveSnapshot.ExpiryDate,
                    SnapshotVerifiedAt =
                        effectiveSnapshot.VerifiedAt,
                    CreatedAt = now,
                    UpdatedAt = now
                });
        }
        else
        {
            link.DocumentVersionId =
                documentVersionId;
            link.SnapshotNameZh =
                effectiveSnapshot.NameZh;
            link.SnapshotNameEn =
                effectiveSnapshot.NameEn;
            link.SnapshotBirthDate =
                effectiveSnapshot.BirthDate;
            link.SnapshotGender =
                effectiveSnapshot.Gender;
            link.SnapshotNationality =
                effectiveSnapshot.Nationality;
            link.SnapshotNationalIdNumber =
                effectiveSnapshot.NationalIdNumber;
            link.SnapshotNameZhOnDocument =
                effectiveSnapshot.NameZhOnDocument;
            link.SnapshotNameEnOnDocument =
                effectiveSnapshot.NameEnOnDocument;
            link.SnapshotDocumentNumber =
                effectiveSnapshot.DocumentNumber;
            link.SnapshotIssuingCountry =
                effectiveSnapshot.IssuingCountry;
            link.SnapshotDocumentNationality =
                effectiveSnapshot.DocumentNationality;
            link.SnapshotExpiryDate =
                effectiveSnapshot.ExpiryDate;
            link.SnapshotVerifiedAt =
                effectiveSnapshot.VerifiedAt;
            link.UpdatedAt = now;
        }

        tour.UpdatedAt = now;
        db.SaveChanges();
        return true;
    }

    public bool RemoveMemberDocument(
        Guid tourId,
        Guid travelerId,
        string documentType,
        DateTimeOffset now)
    {
        var tour = db.Tours.SingleOrDefault(
            item => item.TourId == tourId);

        if (tour is null)
        {
            return false;
        }

        var membership = db.TourMembers
            .SingleOrDefault(item =>
                item.TourId == tourId &&
                item.TravelerId == travelerId);

        if (membership is null)
        {
            return true;
        }

        var normalizedDocumentType =
            documentType.Trim().ToUpperInvariant();

        var link = db.TourMemberDocuments
            .SingleOrDefault(item =>
                item.TourMemberId ==
                    membership.TourMemberId &&
                item.DocumentType ==
                    normalizedDocumentType);

        if (link is not null)
        {
            db.TourMemberDocuments.Remove(link);
            db.SaveChanges();
        }

        var hasDocuments = db.TourMemberDocuments.Any(
            item =>
                item.TourMemberId ==
                    membership.TourMemberId);

        if (!hasDocuments)
        {
            db.TourMembers.Remove(membership);
        }

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

        var memberIds = memberships
            .Select(item => item.TourMemberId)
            .ToList();

        var travelerIds = memberships
            .Select(item => item.TravelerId)
            .Distinct()
            .ToList();

        var travelers = db.Travelers
            .AsNoTracking()
            .Where(item => travelerIds.Contains(item.TravelerId))
            .ToList();

        var requiredDocumentTypes =
            tour.RequiredDocumentTypes;

        var formalLinks = db.TourMemberDocuments
            .AsNoTracking()
            .Where(item =>
                memberIds.Contains(item.TourMemberId) &&
                requiredDocumentTypes.Contains(
                    item.DocumentType))
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
            .Where(item =>
                draftIds.Contains(item.DraftPersonId))
            .ToList();

        var savedDocumentIds = stagedItems
            .Where(item =>
                item.SavedDocumentVersionId.HasValue)
            .Select(item =>
                item.SavedDocumentVersionId!.Value)
            .Distinct()
            .ToList();

        var savedDocumentOwners =
            db.DocumentVersions
                .AsNoTracking()
                .Where(document =>
                    savedDocumentIds.Contains(
                        document.DocumentVersionId))
                .ToDictionary(
                    document =>
                        document.DocumentVersionId,
                    document =>
                        document.TravelerId);

        var personKeys = new HashSet<string>(
            StringComparer.Ordinal);

        var travelerKeys = travelers.ToDictionary(
            item => item.TravelerId,
            item => $"TRAVELER:{item.TravelerId:N}");

        foreach (var key in travelerKeys.Values)
        {
            personKeys.Add(key);
        }

        var memberTravelerIds = memberships.ToDictionary(
            item => item.TourMemberId,
            item => item.TravelerId);

        var draftEnglishNames = stagedItems
            .Where(item =>
                !string.IsNullOrWhiteSpace(
                    item.NameEn))
            .GroupBy(item =>
                item.DraftPersonId)
            .ToDictionary(
                group => group.Key,
                group => group
                    .OrderByDescending(item =>
                        item.UpdatedAt)
                    .Select(item => item.NameEn)
                    .FirstOrDefault() ??
                    string.Empty);

        var draftNationalIds = stagedItems
            .Where(item =>
                !string.IsNullOrWhiteSpace(
                    item.NationalIdNumber))
            .GroupBy(item =>
                item.DraftPersonId)
            .ToDictionary(
                group => group.Key,
                group => group
                    .OrderByDescending(item =>
                        item.UpdatedAt)
                    .Select(item =>
                        item.NationalIdNumber)
                    .FirstOrDefault());

        var draftKeys =
            new Dictionary<Guid, string>();

        foreach (var draft in drafts)
        {
            draftEnglishNames.TryGetValue(
                draft.DraftPersonId,
                out var draftNameEn);
            draftNationalIds.TryGetValue(
                draft.DraftPersonId,
                out var draftNationalId);

            TravelerRecord? matchedTraveler = null;

            var linkedTravelerIds = stagedItems
                .Where(item =>
                    item.DraftPersonId ==
                        draft.DraftPersonId &&
                    item.SavedDocumentVersionId.HasValue &&
                    savedDocumentOwners.TryGetValue(
                        item.SavedDocumentVersionId.Value,
                        out _))
                .Select(item =>
                    savedDocumentOwners[
                        item.SavedDocumentVersionId!.Value])
                .Where(travelerId =>
                    travelerKeys.ContainsKey(
                        travelerId))
                .Distinct()
                .ToList();

            if (linkedTravelerIds.Count == 1)
            {
                matchedTraveler = travelers
                    .Single(item =>
                        item.TravelerId ==
                            linkedTravelerIds[0]);
            }
            else if (
                linkedTravelerIds.Count == 0 &&
                !string.IsNullOrWhiteSpace(
                    draftNationalId))
            {
                var idMatches = travelers
                    .Where(item =>
                        item.NationalIdNumber ==
                            draftNationalId)
                    .ToList();

                if (idMatches.Count == 1)
                {
                    matchedTraveler =
                        idMatches[0];
                }
            }
            else if (
                linkedTravelerIds.Count == 0 &&
                draft.BirthDate.HasValue &&
                !string.IsNullOrWhiteSpace(
                    draft.Gender))
            {
                List<TravelerRecord> identityMatches;

                if (!string.IsNullOrWhiteSpace(
                    draft.NameZh))
                {
                    identityMatches = travelers
                        .Where(item =>
                            item.NameZh ==
                                draft.NameZh &&
                            item.BirthDate ==
                                draft.BirthDate.Value &&
                            item.Gender ==
                                draft.Gender)
                        .ToList();
                }
                else if (!string.IsNullOrWhiteSpace(
                    draftNameEn))
                {
                    identityMatches = travelers
                        .Where(item =>
                            item.NameEn ==
                                draftNameEn &&
                            item.BirthDate ==
                                draft.BirthDate.Value &&
                            item.Gender ==
                                draft.Gender)
                        .ToList();
                }
                else
                {
                    identityMatches = [];
                }

                if (identityMatches.Count == 1)
                {
                    matchedTraveler =
                        identityMatches[0];
                }
            }

            var key =
                matchedTraveler is not null &&
                travelerKeys.TryGetValue(
                    matchedTraveler.TravelerId,
                    out var travelerKey)
                    ? travelerKey
                    : $"DRAFT:{draft.DraftPersonId:N}";

            draftKeys[draft.DraftPersonId] =
                key;
            personKeys.Add(key);
        }

        var receivedDocuments = new HashSet<string>(
            StringComparer.Ordinal);

        foreach (var link in formalLinks)
        {
            if (
                !memberTravelerIds.TryGetValue(
                    link.TourMemberId,
                    out var travelerId) ||
                !travelerKeys.TryGetValue(
                    travelerId,
                    out var personKey))
            {
                continue;
            }

            receivedDocuments.Add(
                $"{personKey}|{link.DocumentType}");
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
            formalLinks.Count,
            personKeys.Count,
            receivedDocuments.Count,
            pendingReviewCount,
            tour.UpdatedAt);
    }

}
