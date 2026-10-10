using System.Globalization;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using PassportScanner.Api.Contracts;
using PassportScanner.Api.Domain;
using PassportScanner.Api.Services;
using PassportScanner.Api.Validation;

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

    private sealed class ReviewedScanSnapshot
    {
        public string NameZh { get; set; } = string.Empty;
        public string NameZhOnDocument { get; set; } = string.Empty;
        public string NameEn { get; set; } = string.Empty;
        public DateOnly? BirthDate { get; set; }
        public string Gender { get; set; } = string.Empty;
        public string? Nationality { get; set; }
        public string? NationalIdNumber { get; set; }
        public string DocumentNumber { get; set; } = string.Empty;
        public string? IssuingCountry { get; set; }
        public DateOnly? ExpiryDate { get; set; }
    }

    public ScanBatchResponse CreateBatch(
        Guid tourId,
        CreateScanBatchRequest request,
        DateTimeOffset now)
    {
        var tour = db.Tours.SingleOrDefault(
            item => item.TourId == tourId)
            ?? throw new KeyNotFoundException("找不到指定團別。");

        EnsureProductionPhotoRetentionActive(
            tour,
            now);

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
            AttemptCount = 0,
            FailedCount = 0,
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

        if (batch.Status != "OPEN")
        {
            throw new InvalidOperationException(
                "這個掃描批次已完成，不能再新增證件。");
        }

        var tour = db.Tours.Single(
            item => item.TourId == batch.TourId);

        EnsureProductionPhotoRetentionActive(
            tour,
            now);

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

        byte[]? ocrInputImageBytes = null;
        string? ocrInputImageContentType = null;

        if (
            !string.IsNullOrWhiteSpace(
                request.OcrInputImageBase64))
        {
            if (
                string.IsNullOrWhiteSpace(
                    request.OcrInputImageContentType) ||
                !request.OcrInputImageContentType.StartsWith(
                    "image/",
                    StringComparison.OrdinalIgnoreCase))
            {
                throw new ArgumentException(
                    "OCR 工作圖片格式錯誤。");
            }

            try
            {
                ocrInputImageBytes =
                    Convert.FromBase64String(
                        request.OcrInputImageBase64);
            }
            catch (FormatException)
            {
                throw new ArgumentException(
                    "OCR 工作圖片資料格式錯誤。");
            }

            if (
                ocrInputImageBytes.Length == 0 ||
                ocrInputImageBytes.Length >
                    15 * 1024 * 1024)
            {
                throw new ArgumentException(
                    "OCR 工作圖片大小不合法。");
            }

            ocrInputImageContentType =
                request.OcrInputImageContentType
                    .Trim()
                    .ToLowerInvariant();
        }

        var identity = NormalizeIdentity(
            request.NameZh,
            request.BirthDate,
            request.Gender);
        var nameEn = Normalize(request.NameEn);
        var nationalIdNumber =
            NormalizeNullable(
                request.NationalIdNumber ??
                (batch.DocumentType ==
                    "TAIWAN_NATIONAL_ID"
                    ? request.DocumentNumber
                    : null));

        var draft = ResolveDraftPerson(
            batch.TourId,
            identity.NameZh,
            nameEn,
            identity.BirthDate,
            identity.Gender,
            ValidGroupingNationalId(
                nationalIdNumber),
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
            OcrInputImageContentType =
                ocrInputImageContentType,
            OcrInputImageBytes =
                ocrInputImageBytes,
            NameZh = identity.NameZh,
            NameZhOnDocument = NormalizeIdentityName(
                string.IsNullOrWhiteSpace(request.NameZhOnDocument)
                    ? request.NameZh
                    : request.NameZhOnDocument),
            NameEn = nameEn,
            BirthDate = identity.BirthDate,
            Gender = identity.Gender,
            Nationality = NormalizeNullable(request.Nationality),
            NationalIdNumber =
                nationalIdNumber,
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
            ReviewSnapshotJson = null,
            DeleteAfter =
                BusinessDate
                    .ProductionPhotoDeleteAfter(
                        tour.ReturnDate),
            CreatedAt = now,
            UpdatedAt = now
        };

        db.ScanItems.Add(item);
        batch.ItemCount += 1;
        batch.UpdatedAt = now;
        db.SaveChanges();

        return ToItemResponse(
            item,
            false,
            now);
    }

    public ScanBatchResponse CompleteBatch(
        Guid batchId,
        CompleteScanBatchRequest request,
        DateTimeOffset now)
    {
        var batch = db.ScanBatches.SingleOrDefault(
            item => item.ScanBatchId == batchId)
            ?? throw new KeyNotFoundException(
                "找不到指定掃描批次。");

        if (batch.Status == "COMPLETED")
        {
            return ToBatchResponse(batch);
        }

        if (batch.Status != "OPEN")
        {
            throw new InvalidOperationException(
                "掃描批次狀態不允許完成。");
        }

        if (
            request.AttemptCount < 0 ||
            request.FailedCount < 0 ||
            request.FailedCount > request.AttemptCount)
        {
            throw new ArgumentException(
                "批次處理張數不可為負數，且失敗張數不可大於總張數。");
        }

        if (
            request.AttemptCount !=
                batch.ItemCount + request.FailedCount)
        {
            throw new ArgumentException(
                "批次總張數必須等於成功加入待審核張數加上失敗張數。");
        }

        batch.AttemptCount = request.AttemptCount;
        batch.FailedCount = request.FailedCount;
        batch.Status = "COMPLETED";
        batch.UpdatedAt = now;
        db.SaveChanges();

        return ToBatchResponse(batch);
    }

    public IReadOnlyList<ScanBatchResponse> ListBatches(
        Guid tourId,
        int limit)
    {
        var safeLimit = Math.Clamp(limit, 1, 20);

        if (!db.Tours.AsNoTracking().Any(
            item => item.TourId == tourId))
        {
            throw new KeyNotFoundException(
                "找不到指定團別。");
        }

        return db.ScanBatches
            .AsNoTracking()
            .Where(item => item.TourId == tourId)
            .OrderByDescending(item => item.UpdatedAt)
            .ThenByDescending(item => item.CreatedAt)
            .Take(safeLimit)
            .ToList()
            .Select(ToBatchResponse)
            .ToList();
    }

    public IReadOnlyList<ReviewQueuePersonResponse> ListReviewQueue(
        Guid tourId,
        DateTimeOffset now)
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

        var itemIds = items
            .Select(item => item.ScanItemId)
            .ToList();

        var selectedTrainingIds = db.TrainingSamples
            .AsNoTracking()
            .Where(item => itemIds.Contains(item.SourceScanItemId))
            .Select(item => item.SourceScanItemId)
            .ToHashSet();

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
                        .Select(item =>
                            ToItemResponse(
                                item,
                                selectedTrainingIds.Contains(
                                    item.ScanItemId),
                                now))
                        .ToList()))
            .ToList();
    }

    public ScanItemImage? GetItemImage(
        Guid scanItemId,
        DateTimeOffset now)
    {
        var item = db.ScanItems
            .AsNoTracking()
            .SingleOrDefault(
                value => value.ScanItemId == scanItemId);

        return item is null ||
            item.DeleteAfter <= now ||
            item.ImageBytes.Length == 0
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

        if (
            item.ReviewStatus == Pending &&
            (
                item.DeleteAfter <= now ||
                item.ImageBytes.Length == 0
            ))
        {
            throw new InvalidOperationException(
                "正式收件照片已達保存期限或已刪除，無法在沒有有效原圖的情況下完成人工審核。");
        }

        using var transaction =
            db.Database.BeginTransaction();

        var oldDraftId = item.DraftPersonId;
        Guid? previousReviewedTravelerId = null;

        if (
            item.ReviewStatus == Reviewed &&
            item.SavedDocumentVersionId.HasValue)
        {
            previousReviewedTravelerId =
                db.DocumentVersions
                    .AsNoTracking()
                    .Where(document =>
                        document.DocumentVersionId ==
                            item.SavedDocumentVersionId.Value)
                    .Select(document =>
                        (Guid?)document.TravelerId)
                    .SingleOrDefault();
        }

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
        item.NationalIdNumber =
            NormalizeNullable(
                request.NationalIdNumber ??
                (item.DocumentType ==
                    "TAIWAN_NATIONAL_ID"
                    ? request.DocumentNumber
                    : null));
        item.DocumentNumber =
            Normalize(request.DocumentNumber);
        item.IssuingCountry =
            NormalizeNullable(request.IssuingCountry);
        item.ExpiryDate = ParseDate(request.ExpiryDate);
        item.UpdatedAt = now;
        item.ReviewSnapshotJson =
            BuildReviewSnapshotJson(item);

        ReassignReviewedItem(
            item,
            oldDraftId,
            identity.NameZh,
            item.NameEn,
            identity.BirthDate,
            identity.Gender,
            ValidGroupingNationalId(
                item.NationalIdNumber),
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

        if (!tourStore.EnsureMemberDocument(
            batch.TourId,
            saved.TravelerId,
            saved.DocumentVersionId,
            item.DocumentType,
            now,
            BuildTourMemberSnapshot(
                item,
                now)))
        {
            throw new KeyNotFoundException(
                "找不到指定團別、旅客或正式證件版本，或此團未要求這個證件類型。");
        }

        item.ReviewStatus = Reviewed;
        item.SavedDocumentVersionId =
            saved.DocumentVersionId;
        item.ReviewedAt = now;
        item.UpdatedAt = now;
        db.SaveChanges();

        if (
            previousReviewedTravelerId.HasValue &&
            previousReviewedTravelerId.Value !=
                saved.TravelerId)
        {
            ReconcileTourDocumentLink(
                batch.TourId,
                previousReviewedTravelerId.Value,
                item.DocumentType,
                item.ScanItemId,
                now);
        }

        trainingDatasetStore.SetSelection(
            item.ScanItemId,
            request.UseForTraining,
            now);

        transaction.Commit();

        return ToItemResponse(
            item,
            request.UseForTraining,
            now);
    }

    public bool DeleteItem(
        Guid scanItemId,
        DateTimeOffset now)
    {
        var item = db.ScanItems.SingleOrDefault(
            value => value.ScanItemId == scanItemId);

        if (item is null)
        {
            return false;
        }

        using var transaction =
            db.Database.BeginTransaction();

        var draftId = item.DraftPersonId;
        var batch = db.ScanBatches.Single(
            value => value.ScanBatchId == item.ScanBatchId);

        if (item.ReviewStatus == Reviewed)
        {
            throw new InvalidOperationException(
                "已審核的正式收件紀錄不可直接刪除；請使用明確更正流程。");
        }

        if (item.ReviewStatus != Pending)
        {
            throw new InvalidOperationException(
                "目前狀態不允許刪除這筆證件。");
        }

        db.ScanItems.Remove(item);

        if (
            batch.Status == "OPEN" &&
            item.ReviewStatus == Pending)
        {
            batch.ItemCount = Math.Max(
                0,
                batch.ItemCount - 1);
        }

        batch.UpdatedAt = now;
        db.SaveChanges();

        CleanupEmptyDraft(draftId);
        db.SaveChanges();

        transaction.Commit();

        return true;
    }

    private void ReconcileTourDocumentLink(
        Guid tourId,
        Guid travelerId,
        string documentType,
        Guid? excludingScanItemId,
        DateTimeOffset now)
    {
        // Never choose older scan as implicit replacement.
        tourStore.RemoveMemberDocument(
            tourId,
            travelerId,
            documentType,
            now);
    }

        public int PurgeExpiredImages(
        DateTimeOffset now)
    {
        return db.Database.ExecuteSqlInterpolated(
            $@"UPDATE scan_items
               SET image_bytes = decode('', 'hex'),
                   ocr_input_image_bytes = NULL,
                   updated_at = {now}
               WHERE delete_after <= {now}
                 AND (
                     octet_length(image_bytes) > 0
                     OR ocr_input_image_bytes IS NOT NULL
                 )");
    }

    private static TourMemberDocumentSnapshotInput
        BuildTourMemberSnapshot(
            ScanItemRecord item,
            DateTimeOffset verifiedAt)
    {
        var reviewSnapshot =
            ReadReviewSnapshot(item);
        var birthDate = reviewSnapshot is null
            ? item.BirthDate
            : reviewSnapshot.BirthDate;

        if (!birthDate.HasValue)
        {
            throw new InvalidOperationException(
                "已審核證件缺少出生日期，無法建立團別快照。");
        }

        return new TourMemberDocumentSnapshotInput(
            reviewSnapshot is null
                ? item.NameZh
                : reviewSnapshot.NameZh,
            reviewSnapshot is null
                ? item.NameEn
                : reviewSnapshot.NameEn,
            birthDate.Value,
            reviewSnapshot is null
                ? item.Gender
                : reviewSnapshot.Gender,
            reviewSnapshot is null
                ? item.Nationality
                : reviewSnapshot.Nationality,
            reviewSnapshot is null
                ? item.NationalIdNumber
                : reviewSnapshot.NationalIdNumber,
            reviewSnapshot is null
                ? item.NameZhOnDocument
                : reviewSnapshot.NameZhOnDocument,
            reviewSnapshot is null
                ? item.NameEn
                : reviewSnapshot.NameEn,
            reviewSnapshot is null
                ? item.DocumentNumber
                : reviewSnapshot.DocumentNumber,
            reviewSnapshot is null
                ? item.IssuingCountry
                : reviewSnapshot.IssuingCountry,
            reviewSnapshot is null
                ? item.Nationality
                : reviewSnapshot.Nationality,
            reviewSnapshot is null
                ? item.ExpiryDate
                : reviewSnapshot.ExpiryDate,
            verifiedAt);
    }

    private static string BuildReviewSnapshotJson(
        ScanItemRecord item) =>
        JsonSerializer.Serialize(
            new ReviewedScanSnapshot
            {
                NameZh = item.NameZh,
                NameZhOnDocument = item.NameZhOnDocument,
                NameEn = item.NameEn,
                BirthDate = item.BirthDate,
                Gender = item.Gender,
                Nationality = item.Nationality,
                NationalIdNumber = item.NationalIdNumber,
                DocumentNumber = item.DocumentNumber,
                IssuingCountry = item.IssuingCountry,
                ExpiryDate = item.ExpiryDate
            });

    private static ReviewedScanSnapshot? ReadReviewSnapshot(
        ScanItemRecord item)
    {
        if (string.IsNullOrWhiteSpace(
            item.ReviewSnapshotJson))
        {
            return null;
        }

        try
        {
            return JsonSerializer.Deserialize<
                ReviewedScanSnapshot>(
                item.ReviewSnapshotJson);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static ReviewedDocumentInput BuildReviewedDocumentInput(
        ScanItemRecord item,
        DateTimeOffset now)
    {
        var requiresChineseName =
            item.DocumentType != "PASSPORT" ||
            item.Nationality == "TWN" ||
            item.IssuingCountry == "TWN";

        if (
            requiresChineseName &&
            string.IsNullOrWhiteSpace(item.NameZh))
        {
            throw new ArgumentException(
                "審核完成前必須確認中文姓名。");
        }

        if (
            string.IsNullOrWhiteSpace(item.NameZh) &&
            string.IsNullOrWhiteSpace(item.NameEn))
        {
            throw new ArgumentException(
                "審核完成前中文姓名與英文姓名至少需要一個。");
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
            item.NationalIdNumber,
            item.DocumentNumber,
            item.IssuingCountry,
            item.ExpiryDate,
            now);
    }

    private TourPersonDraftRecord ResolveDraftPerson(
        Guid tourId,
        string nameZh,
        string nameEn,
        DateOnly? birthDate,
        string gender,
        string? nationalIdNumber,
        DateTimeOffset now)
    {
        if (nationalIdNumber is not null)
        {
            var strongMatches =
                FindDraftMatchesByNationalId(
                    tourId,
                    nationalIdNumber);

            if (strongMatches.Count > 0)
            {
                return ConsolidateDrafts(
                    strongMatches,
                    now);
            }
        }

        if (HasCompleteIdentity(
            nameZh,
            nameEn,
            birthDate,
            gender))
        {
            var weakMatches = FindDraftMatches(
                tourId,
                nameZh,
                nameEn,
                birthDate!.Value,
                gender,
                nationalIdNumber);

            if (weakMatches.Count == 1)
            {
                return weakMatches[0];
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
        string nameEn,
        DateOnly? birthDate,
        string gender,
        string? nationalIdNumber,
        DateTimeOffset now)
    {
        var oldDraft = db.TourPersonDrafts.Single(
            draft =>
                draft.DraftPersonId ==
                    oldDraftId);

        if (!HasCompleteIdentity(
            nameZh,
            nameEn,
            birthDate,
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

        if (nationalIdNumber is not null)
        {
            var strongMatches =
                FindDraftMatchesByNationalId(
                    oldDraft.TourId,
                    nationalIdNumber)
                .Where(draft =>
                    draft.DraftPersonId !=
                        oldDraftId)
                .ToList();

            if (strongMatches.Count > 0)
            {
                var target = ConsolidateDrafts(
                    strongMatches,
                    now);
                item.DraftPersonId =
                    target.DraftPersonId;
                return;
            }
        }

        var weakMatches = FindDraftMatches(
            oldDraft.TourId,
            nameZh,
            nameEn,
            birthDate!.Value,
            gender,
            nationalIdNumber)
            .Where(draft =>
                draft.DraftPersonId !=
                    oldDraftId)
            .ToList();

        if (weakMatches.Count == 1)
        {
            item.DraftPersonId =
                weakMatches[0].DraftPersonId;
            return;
        }

        var siblingCount = db.ScanItems.Count(
            candidate =>
                candidate.DraftPersonId ==
                    oldDraftId &&
                candidate.ScanItemId !=
                    item.ScanItemId);

        if (
            siblingCount == 0 ||
            DraftIdentityMatches(
                oldDraft,
                item.ScanItemId,
                nameZh,
                nameEn,
                birthDate.Value,
                gender,
                nationalIdNumber))
        {
            UpdateDraftIdentity(
                oldDraft,
                nameZh,
                birthDate,
                gender,
                now);
            return;
        }

        var newDraft =
            new TourPersonDraftRecord
            {
                DraftPersonId =
                    Guid.NewGuid(),
                TourId =
                    oldDraft.TourId,
                NameZh =
                    nameZh,
                BirthDate =
                    birthDate,
                Gender =
                    gender,
                CreatedAt =
                    now,
                UpdatedAt =
                    now
            };

        db.TourPersonDrafts.Add(newDraft);
        item.DraftPersonId =
            newDraft.DraftPersonId;
    }

    private List<TourPersonDraftRecord>
        FindDraftMatchesByNationalId(
            Guid tourId,
            string nationalIdNumber)
    {
        var draftIds = (
            from scan in db.ScanItems.AsNoTracking()
            join batch in db.ScanBatches.AsNoTracking()
                on scan.ScanBatchId
                equals batch.ScanBatchId
            where
                batch.TourId == tourId &&
                scan.NationalIdNumber ==
                    nationalIdNumber
            select scan.DraftPersonId
        )
        .Distinct()
        .ToList();

        if (draftIds.Count == 0)
        {
            return [];
        }

        return db.TourPersonDrafts
            .Where(draft =>
                draftIds.Contains(
                    draft.DraftPersonId))
            .OrderBy(draft =>
                draft.CreatedAt)
            .ThenBy(draft =>
                draft.DraftPersonId)
            .ToList();
    }

    private List<TourPersonDraftRecord>
        FindDraftMatches(
            Guid tourId,
            string nameZh,
            string nameEn,
            DateOnly birthDate,
            string gender,
            string? nationalIdNumber)
    {
        var candidates = db.TourPersonDrafts
            .Where(item =>
                item.TourId == tourId &&
                item.BirthDate == birthDate &&
                item.Gender == gender)
            .OrderBy(item =>
                item.CreatedAt)
            .ThenBy(item =>
                item.DraftPersonId)
            .ToList();

        if (!string.IsNullOrWhiteSpace(nameZh))
        {
            candidates = candidates
                .Where(item =>
                    item.NameZh == nameZh)
                .ToList();
        }
        else if (!string.IsNullOrWhiteSpace(nameEn))
        {
            var candidateIds = candidates
                .Where(item =>
                    string.IsNullOrWhiteSpace(
                        item.NameZh))
                .Select(item =>
                    item.DraftPersonId)
                .ToList();

            var matchingIds = db.ScanItems
                .AsNoTracking()
                .Where(item =>
                    candidateIds.Contains(
                        item.DraftPersonId) &&
                    item.NameEn == nameEn)
                .Select(item =>
                    item.DraftPersonId)
                .Distinct()
                .ToHashSet();

            candidates = candidates
                .Where(item =>
                    matchingIds.Contains(
                        item.DraftPersonId))
                .ToList();
        }
        else
        {
            return [];
        }

        if (
            nationalIdNumber is null ||
            candidates.Count == 0)
        {
            return candidates;
        }

        var candidateDraftIds = candidates
            .Select(item =>
                item.DraftPersonId)
            .ToList();

        var conflictingDraftIds =
            db.ScanItems
                .AsNoTracking()
                .Where(item =>
                    candidateDraftIds.Contains(
                        item.DraftPersonId) &&
                    item.NationalIdNumber != null &&
                    item.NationalIdNumber !=
                        nationalIdNumber)
                .Select(item => new
                {
                    item.DraftPersonId,
                    item.NationalIdNumber
                })
                .ToList()
                .Where(item =>
                    ValidGroupingNationalId(
                        item.NationalIdNumber) is
                        not null)
                .Select(item =>
                    item.DraftPersonId)
                .ToHashSet();

        return candidates
            .Where(item =>
                !conflictingDraftIds.Contains(
                    item.DraftPersonId))
            .ToList();
    }

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

    private bool DraftIdentityMatches(
        TourPersonDraftRecord draft,
        Guid currentScanItemId,
        string nameZh,
        string nameEn,
        DateOnly birthDate,
        string gender,
        string? nationalIdNumber)
    {
        if (
            draft.BirthDate != birthDate ||
            draft.Gender != gender)
        {
            return false;
        }

        if (nationalIdNumber is not null)
        {
            var conflictingNationalId =
                db.ScanItems
                    .AsNoTracking()
                    .Where(item =>
                        item.DraftPersonId ==
                            draft.DraftPersonId &&
                        item.ScanItemId !=
                            currentScanItemId &&
                        item.NationalIdNumber != null)
                    .Select(item =>
                        item.NationalIdNumber)
                    .ToList()
                    .Any(value =>
                        ValidGroupingNationalId(value) is
                            string valid &&
                        valid != nationalIdNumber);

            if (conflictingNationalId)
            {
                return false;
            }
        }

        if (!string.IsNullOrWhiteSpace(nameZh))
        {
            return draft.NameZh == nameZh;
        }

        if (
            !string.IsNullOrWhiteSpace(
                draft.NameZh) ||
            string.IsNullOrWhiteSpace(
                nameEn))
        {
            return false;
        }

        return db.ScanItems.Any(
            item =>
                item.DraftPersonId ==
                    draft.DraftPersonId &&
                item.ScanItemId !=
                    currentScanItemId &&
                item.NameEn == nameEn);
    }

    private static string? ValidGroupingNationalId(
        string? value)
    {
        var normalized =
            NormalizeNullable(value);

        return
            normalized is not null &&
            TaiwanNationalIdReviewValidator
                .IsValidNationalId(normalized)
                ? normalized
                : null;
    }

    private static bool HasCompleteIdentity(
        string nameZh,
        string nameEn,
        DateOnly? birthDate,
        string gender) =>
        (
            !string.IsNullOrWhiteSpace(
                nameZh) ||
            !string.IsNullOrWhiteSpace(
                nameEn)
        ) &&
        birthDate.HasValue &&
        !string.IsNullOrWhiteSpace(
            gender);

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

    private static void EnsureProductionPhotoRetentionActive(
        TourRecord tour,
        DateTimeOffset now)
    {
        var deleteAfter =
            BusinessDate.ProductionPhotoDeleteAfter(
                tour.ReturnDate);

        if (deleteAfter <= now)
        {
            throw new InvalidOperationException(
                "這個團別的回國日已超過證件照片保存期限，不能再建立新的掃描收件；請先確認並修正團別日期。");
        }
    }

    private static ScanBatchResponse ToBatchResponse(
        ScanBatchRecord batch) =>
        new(
            batch.ScanBatchId,
            batch.TourId,
            batch.DocumentType,
            batch.Status,
            batch.ItemCount,
            batch.AttemptCount,
            batch.FailedCount,
            batch.CreatedAt,
            batch.UpdatedAt);

    private static ScanItemResponse ToItemResponse(
        ScanItemRecord item,
        bool trainingSelected,
        DateTimeOffset now) =>
        new(
            item.ScanItemId,
            item.ScanBatchId,
            item.DraftPersonId,
            item.DocumentType,
            item.OriginalFileName,
            item.ImageContentType,
            item.DeleteAfter > now &&
                item.ImageBytes.Length > 0,
            item.NameZh,
            item.NameZhOnDocument,
            item.NameEn,
            item.BirthDate,
            item.Gender,
            item.Nationality,
            item.NationalIdNumber,
            item.DocumentNumber,
            item.IssuingCountry,
            item.ExpiryDate,
            item.SavedDocumentVersionId,
            item.ReviewStatus,
            trainingSelected,
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
