using System.Globalization;
using Microsoft.EntityFrameworkCore;
using PassportScanner.Api.Contracts;
using PassportScanner.Api.Domain;

namespace PassportScanner.Api.Persistence;

public sealed class PostgresScanQueueStore(
    PassportScannerDbContext db,
    ITravelerStore travelerStore,
    ITourStore tourStore,
    ITrainingDatasetStore trainingDatasetStore)
    : IScanQueueStore
{
    private const string Pending = "PENDING";
    private const string Reviewed = "REVIEWED";

    public ScanBatchResponse CreateBatch(
        Guid tourId,
        CreateScanBatchRequest request,
        DateTimeOffset now)
    {
        var tour = db.Tours.SingleOrDefault(
            item => item.TourId == tourId)
            ?? throw new KeyNotFoundException("找不到指定團別。");

        var documentType = Normalize(request.DocumentType);

        if (!tour.RequiredDocumentTypes.Contains(
            documentType,
            StringComparer.Ordinal))
        {
            throw new ArgumentException(
                "這個團別沒有設定需要此證件類型。");
        }

        var batch = new ScanBatchRecord
        {
            ScanBatchId = Guid.NewGuid(),
            TourId = tourId,
            DocumentType = documentType,
            Status = "OPEN",
            ItemCount = 0,
            CreatedAt = now,
            UpdatedAt = now
        };

        db.ScanBatches.Add(batch);
        db.SaveChanges();

        return ToBatchResponse(batch);
    }

    public ScanItemResponse AddItem(
        Guid batchId,
        CreateScanItemRequest request,
        DateTimeOffset now)
    {
        var batch = db.ScanBatches.SingleOrDefault(
            item => item.ScanBatchId == batchId)
            ?? throw new KeyNotFoundException("找不到指定掃描批次。");

        var tour = db.Tours.Single(
            item => item.TourId == batch.TourId);

        if (string.IsNullOrWhiteSpace(request.ImageContentType) ||
            !request.ImageContentType.StartsWith(
                "image/",
                StringComparison.OrdinalIgnoreCase))
        {
            throw new ArgumentException("只接受圖片格式。");
        }

        byte[] imageBytes;

        try
        {
            imageBytes = Convert.FromBase64String(
                request.ImageBase64);
        }
        catch (FormatException)
        {
            throw new ArgumentException("圖片資料格式錯誤。");
        }

        if (imageBytes.Length == 0)
        {
            throw new ArgumentException("圖片不可為空白。");
        }

        if (imageBytes.Length > 15 * 1024 * 1024)
        {
            throw new ArgumentException("單張圖片不可超過 15 MB。");
        }

        var identity = NormalizeIdentity(
            request.NameZh,
            request.BirthDate,
            request.Gender);

        var draft = ResolveDraftPerson(
            batch.TourId,
            identity.NameZh,
            identity.BirthDate,
            identity.Gender,
            now);

        var item = new ScanItemRecord
        {
            ScanItemId = Guid.NewGuid(),
            ScanBatchId = batch.ScanBatchId,
            DraftPersonId = draft.DraftPersonId,
            DocumentType = batch.DocumentType,
            OriginalFileName =
                request.OriginalFileName.Trim(),
            ImageContentType =
                request.ImageContentType.Trim().ToLowerInvariant(),
            ImageBytes = imageBytes,
            NameZh = identity.NameZh,
            NameZhOnDocument = NormalizeIdentityName(
                string.IsNullOrWhiteSpace(request.NameZhOnDocument)
                    ? request.NameZh
                    : request.NameZhOnDocument),
            NameEn = Normalize(request.NameEn),
            BirthDate = identity.BirthDate,
            Gender = identity.Gender,
            Nationality = NormalizeNullable(request.Nationality),
            DocumentNumber = Normalize(request.DocumentNumber),
            IssuingCountry =
                NormalizeNullable(request.IssuingCountry),
            ExpiryDate = ParseDate(request.ExpiryDate),
            OcrPayloadJson =
                string.IsNullOrWhiteSpace(request.OcrPayloadJson)
                    ? "{}"
                    : request.OcrPayloadJson,
            ReviewStatus = Pending,
            SavedDocumentVersionId = null,
            ReviewedAt = null,
            DeleteAfter = new DateTimeOffset(
                tour.ReturnDate
                    .AddDays(8)
                    .ToDateTime(
                        TimeOnly.MinValue,
                        DateTimeKind.Utc)),
            CreatedAt = now,
            UpdatedAt = now
        };

        db.ScanItems.Add(item);
        batch.ItemCount += 1;
        batch.UpdatedAt = now;
        db.SaveChanges();

        return ToItemResponse(item);
    }

    public IReadOnlyList<ReviewQueuePersonResponse> ListReviewQueue(
        Guid tourId)
    {
        var drafts = db.TourPersonDrafts
            .AsNoTracking()
            .Where(item => item.TourId == tourId)
            .OrderBy(item => item.CreatedAt)
            .ToList();

        if (drafts.Count == 0)
        {
            return [];
        }

        var draftIds = drafts
            .Select(item => item.DraftPersonId)
            .ToList();

        var items = db.ScanItems
            .AsNoTracking()
            .Where(item => draftIds.Contains(item.DraftPersonId))
            .OrderBy(item => item.CreatedAt)
            .ToList();

        return drafts
            .Select(draft =>
                new ReviewQueuePersonResponse(
                    draft.DraftPersonId,
                    draft.NameZh,
                    draft.BirthDate,
                    draft.Gender,
                    items
                        .Where(item =>
                            item.DraftPersonId ==
                            draft.DraftPersonId)
                        .Select(ToItemResponse)
                        .ToList()))
            .ToList();
    }

    public ScanItemImage? GetItemImage(Guid scanItemId)
    {
        var item = db.ScanItems
            .AsNoTracking()
            .SingleOrDefault(
                value => value.ScanItemId == scanItemId);

        return item is null
            ? null
            : new ScanItemImage(
                item.ImageBytes,
                item.ImageContentType,
                item.OriginalFileName);
    }

    public ScanItemResponse? ReviewItem(
        Guid scanItemId,
        ReviewScanItemRequest request,
        DateTimeOffset now)
    {
        var item = db.ScanItems.SingleOrDefault(
            value => value.ScanItemId == scanItemId);

        if (item is null)
        {
            return null;
        }

        var oldDraftId = item.DraftPersonId;
        var identity = NormalizeIdentity(
            request.NameZh,
            request.BirthDate,
            request.Gender);

        item.NameZh = identity.NameZh;
        item.NameZhOnDocument = NormalizeIdentityName(
            string.IsNullOrWhiteSpace(request.NameZhOnDocument)
                ? request.NameZh
                : request.NameZhOnDocument);
        item.NameEn = Normalize(request.NameEn);
        item.BirthDate = identity.BirthDate;
        item.Gender = identity.Gender;
        item.Nationality =
            NormalizeNullable(request.Nationality);
        item.DocumentNumber =
            Normalize(request.DocumentNumber);
        item.IssuingCountry =
            NormalizeNullable(request.IssuingCountry);
        item.ExpiryDate = ParseDate(request.ExpiryDate);
        item.UpdatedAt = now;

        ReassignReviewedItem(
            item,
            oldDraftId,
            identity.NameZh,
            identity.BirthDate,
            identity.Gender,
            now);

        db.SaveChanges();
        CleanupEmptyDraft(oldDraftId);
        db.SaveChanges();

        var reviewedDocument = BuildReviewedDocumentInput(
            item,
            now);

        var saved = travelerStore.SaveDocumentReview(
            reviewedDocument,
            now);

        var batch = db.ScanBatches
            .AsNoTracking()
            .Single(value =>
                value.ScanBatchId == item.ScanBatchId);

        if (!tourStore.EnsureMember(
            batch.TourId,
            saved.TravelerId,
            now))
        {
            throw new KeyNotFoundException(
                "找不到指定團別。");
        }

        item.ReviewStatus = Reviewed;
        item.SavedDocumentVersionId =
            saved.DocumentVersionId;
        item.ReviewedAt = now;
        item.UpdatedAt = now;
        db.SaveChanges();

        if (request.UseForTraining)
        {
            trainingDatasetStore.SetSelection(
                item.ScanItemId,
                true,
                now);
        }

        return ToItemResponse(item);
    }

    public bool DeletePendingItem(
        Guid scanItemId,
        DateTimeOffset now)
    {
        var item = db.ScanItems.SingleOrDefault(
            value => value.ScanItemId == scanItemId);

        if (item is null)
        {
            return false;
        }

        if (item.ReviewStatus != Pending)
        {
            throw new InvalidOperationException(
                "已完成人工審核的證件不能從待審核視窗刪除。");
        }

        var draftId = item.DraftPersonId;
        var batch = db.ScanBatches.Single(
            value => value.ScanBatchId == item.ScanBatchId);

        db.ScanItems.Remove(item);
        batch.ItemCount = Math.Max(
            0,
            batch.ItemCount - 1);
        batch.UpdatedAt = now;
        db.SaveChanges();

        CleanupEmptyDraft(draftId);
        db.SaveChanges();

        return true;
    }

    private static ReviewedDocumentInput BuildReviewedDocumentInput(
        ScanItemRecord item,
        DateTimeOffset now)
    {
        if (string.IsNullOrWhiteSpace(item.NameZh))
        {
            throw new ArgumentException(
                "審核完成前必須確認中文姓名。");
        }

        if (!item.BirthDate.HasValue)
        {
            throw new ArgumentException(
                "審核完成前必須確認出生日期。");
        }

        if (string.IsNullOrWhiteSpace(item.Gender))
        {
            throw new ArgumentException(
                "審核完成前必須確認性別。");
        }

        if (string.IsNullOrWhiteSpace(item.DocumentNumber))
        {
            throw new ArgumentException(
                "審核完成前必須確認證件號碼。");
        }

        return new ReviewedDocumentInput(
            item.DocumentType,
            item.NameZh,
            item.NameZhOnDocument,
            item.NameEn,
            item.BirthDate.Value,
            item.Gender,
            item.Nationality,
            item.DocumentNumber,
            item.IssuingCountry,
            item.ExpiryDate,
            now);
    }

    private TourPersonDraftRecord ResolveDraftPerson(
        Guid tourId,
        string nameZh,
        DateOnly? birthDate,
        string gender,
        DateTimeOffset now)
    {
        if (HasCompleteIdentity(nameZh, birthDate, gender))
        {
            var matches = FindDraftMatches(
                tourId,
                nameZh,
                birthDate!.Value,
                gender);

            if (matches.Count > 0)
            {
                return ConsolidateDrafts(matches, now);
            }
        }

        var draft = new TourPersonDraftRecord
        {
            DraftPersonId = Guid.NewGuid(),
            TourId = tourId,
            NameZh = nameZh,
            BirthDate = birthDate,
            Gender = gender,
            CreatedAt = now,
            UpdatedAt = now
        };

        db.TourPersonDrafts.Add(draft);
        db.SaveChanges();
        return draft;
    }

    private void ReassignReviewedItem(
        ScanItemRecord item,
        Guid oldDraftId,
        string nameZh,
        DateOnly? birthDate,
        string gender,
        DateTimeOffset now)
    {
        var oldDraft = db.TourPersonDrafts.Single(
            draft => draft.DraftPersonId == oldDraftId);

        if (!HasCompleteIdentity(nameZh, birthDate, gender))
        {
            UpdateDraftIdentity(
                oldDraft,
                nameZh,
                birthDate,
                gender,
                now);
            return;
        }

        var matches = FindDraftMatches(
            oldDraft.TourId,
            nameZh,
            birthDate!.Value,
            gender)
            .Where(draft =>
                draft.DraftPersonId != oldDraftId)
            .ToList();

        if (matches.Count > 0)
        {
            var target = ConsolidateDrafts(matches, now);
            item.DraftPersonId = target.DraftPersonId;
            return;
        }

        var siblingCount = db.ScanItems.Count(
            candidate =>
                candidate.DraftPersonId == oldDraftId &&
                candidate.ScanItemId != item.ScanItemId);

        if (
            siblingCount == 0 ||
            DraftIdentityMatches(
                oldDraft,
                nameZh,
                birthDate.Value,
                gender))
        {
            UpdateDraftIdentity(
                oldDraft,
                nameZh,
                birthDate,
                gender,
                now);
            return;
        }

        var newDraft = new TourPersonDraftRecord
        {
            DraftPersonId = Guid.NewGuid(),
            TourId = oldDraft.TourId,
            NameZh = nameZh,
            BirthDate = birthDate,
            Gender = gender,
            CreatedAt = now,
            UpdatedAt = now
        };

        db.TourPersonDrafts.Add(newDraft);
        item.DraftPersonId = newDraft.DraftPersonId;
    }

    private List<TourPersonDraftRecord> FindDraftMatches(
        Guid tourId,
        string nameZh,
        DateOnly birthDate,
        string gender) =>
        db.TourPersonDrafts
            .Where(item =>
                item.TourId == tourId &&
                item.NameZh == nameZh &&
                item.BirthDate == birthDate &&
                item.Gender == gender)
            .OrderBy(item => item.CreatedAt)
            .ThenBy(item => item.DraftPersonId)
            .ToList();

    private TourPersonDraftRecord ConsolidateDrafts(
        IReadOnlyList<TourPersonDraftRecord> drafts,
        DateTimeOffset now)
    {
        var canonical = drafts
            .OrderBy(item => item.CreatedAt)
            .ThenBy(item => item.DraftPersonId)
            .First();

        foreach (var duplicate in drafts.Where(
            item => item.DraftPersonId != canonical.DraftPersonId))
        {
            var items = db.ScanItems
                .Where(item =>
                    item.DraftPersonId == duplicate.DraftPersonId)
                .ToList();

            foreach (var item in items)
            {
                item.DraftPersonId = canonical.DraftPersonId;
            }

            db.TourPersonDrafts.Remove(duplicate);
        }

        canonical.UpdatedAt = now;
        db.SaveChanges();
        return canonical;
    }

    private void CleanupEmptyDraft(Guid draftPersonId)
    {
        var hasItems = db.ScanItems.Any(
            item => item.DraftPersonId == draftPersonId);

        if (hasItems)
        {
            return;
        }

        var draft = db.TourPersonDrafts.SingleOrDefault(
            item => item.DraftPersonId == draftPersonId);

        if (draft is not null)
        {
            db.TourPersonDrafts.Remove(draft);
        }
    }

    private static void UpdateDraftIdentity(
        TourPersonDraftRecord draft,
        string nameZh,
        DateOnly? birthDate,
        string gender,
        DateTimeOffset now)
    {
        draft.NameZh = nameZh;
        draft.BirthDate = birthDate;
        draft.Gender = gender;
        draft.UpdatedAt = now;
    }

    private static bool DraftIdentityMatches(
        TourPersonDraftRecord draft,
        string nameZh,
        DateOnly birthDate,
        string gender) =>
        draft.NameZh == nameZh &&
        draft.BirthDate == birthDate &&
        draft.Gender == gender;

    private static bool HasCompleteIdentity(
        string nameZh,
        DateOnly? birthDate,
        string gender) =>
        !string.IsNullOrWhiteSpace(nameZh) &&
        birthDate.HasValue &&
        !string.IsNullOrWhiteSpace(gender);

    private static (
        string NameZh,
        DateOnly? BirthDate,
        string Gender)
        NormalizeIdentity(
            string nameZh,
            string? birthDate,
            string gender) =>
        (
            NormalizeIdentityName(nameZh),
            ParseDate(birthDate),
            Normalize(gender)
        );

    private static DateOnly? ParseDate(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        if (DateOnly.TryParseExact(
            value.Trim(),
            "yyyy-MM-dd",
            CultureInfo.InvariantCulture,
            DateTimeStyles.None,
            out var parsed))
        {
            return parsed;
        }

        throw new ArgumentException(
            "日期格式必須為 YYYY-MM-DD。");
    }

    private static ScanBatchResponse ToBatchResponse(
        ScanBatchRecord batch) =>
        new(
            batch.ScanBatchId,
            batch.TourId,
            batch.DocumentType,
            batch.Status,
            batch.ItemCount,
            batch.CreatedAt,
            batch.UpdatedAt);

    private static ScanItemResponse ToItemResponse(
        ScanItemRecord item) =>
        new(
            item.ScanItemId,
            item.ScanBatchId,
            item.DraftPersonId,
            item.DocumentType,
            item.OriginalFileName,
            item.ImageContentType,
            item.NameZh,
            item.NameZhOnDocument,
            item.NameEn,
            item.BirthDate,
            item.Gender,
            item.Nationality,
            item.DocumentNumber,
            item.IssuingCountry,
            item.ExpiryDate,
            item.ReviewStatus,
            item.ReviewedAt,
            item.DeleteAfter,
            item.CreatedAt,
            item.UpdatedAt);

    private static string NormalizeIdentityName(string value) =>
        string.Concat(
            (value ?? string.Empty)
                .Trim()
                .Where(character =>
                    !char.IsWhiteSpace(character)));

    private static string Normalize(string? value) =>
        (value ?? string.Empty)
            .Trim()
            .ToUpperInvariant();

    private static string? NormalizeNullable(string? value)
    {
        var normalized = Normalize(value);
        return string.IsNullOrWhiteSpace(normalized)
            ? null
            : normalized;
    }
}
