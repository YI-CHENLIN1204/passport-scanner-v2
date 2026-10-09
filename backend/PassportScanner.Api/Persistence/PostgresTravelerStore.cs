using System.Globalization;
using Microsoft.EntityFrameworkCore;
using PassportScanner.Api.Contracts;
using PassportScanner.Api.Domain;
using PassportScanner.Api.Validation;
using PassportScanner.Api.Services;

namespace PassportScanner.Api.Persistence;

public sealed class PostgresTravelerStore(
    PassportScannerDbContext db,
    ITrainingDatasetStore trainingDatasetStore)
    : ITravelerStore
{
    public int TravelerCount =>
        db.Travelers.Count();

    public int DocumentVersionCount =>
        db.DocumentVersions.Count();

    public DocumentSaveResult SaveDocumentReview(
        ReviewedDocumentInput input,
        DateTimeOffset now)
    {
        var documentType = Normalize(input.DocumentType);
        var nameZh = NormalizeIdentityName(input.ChineseName);
        var nameZhOnDocument = NormalizeIdentityName(
            string.IsNullOrWhiteSpace(input.ChineseNameOnDocument)
                ? input.ChineseName
                : input.ChineseNameOnDocument);
        var nameEn = Normalize(input.EnglishName);
        var documentNumber = Normalize(input.DocumentNumber);
        var nationality = NormalizeNullable(input.Nationality);
        var nationalIdNumber =
            NormalizeNullable(input.NationalIdNumber);
        var issuingCountry = NormalizeNullable(input.IssuingCountry);
        var sex = Normalize(input.Sex);

        ValidateFormalIdentity(
            nameZh,
            nameEn,
            input.BirthDate,
            sex,
            nationality,
            documentType,
            issuingCountry,
            now);

        ValidateDocumentFields(
            documentType,
            documentNumber,
            nameEn,
            nationality,
            issuingCountry,
            input.ExpiryDate,
            input.BirthDate);

        if (documentType == "TAIWAN_NATIONAL_ID")
        {
            if (!TaiwanNationalIdReviewValidator
                .IsValidNationalId(
                    documentNumber))
            {
                throw new ArgumentException(
                    "身分證證件號碼格式或檢查碼不正確。");
            }

            if (
                !string.IsNullOrWhiteSpace(
                    nationalIdNumber) &&
                nationalIdNumber !=
                    documentNumber)
            {
                throw new ArgumentException(
                    "旅客主檔身分證字號與身分證證件號碼不一致。");
            }

            nationalIdNumber = documentNumber;
        }
        else if (
            !string.IsNullOrWhiteSpace(
                nationalIdNumber) &&
            !TaiwanNationalIdReviewValidator
                .IsValidNationalId(
                    nationalIdNumber))
        {
            throw new ArgumentException(
                "身分證字號格式或檢查碼不正確。");
        }

        if (
            documentType == "TAIWAN_NATIONAL_ID" &&
            sex is not ("M" or "F"))
        {
            throw new ArgumentException(
                "台灣身分證旅客性別必須為 M 或 F。");
        }

        if (nationalIdNumber is not null)
        {
            ValidateNationalIdGender(
                nationalIdNumber,
                sex);
        }

        var ownsTransaction =
            db.Database.CurrentTransaction is null;

        using var transaction =
            ownsTransaction
                ? db.Database.BeginTransaction()
                : null;

        var existingDocument = FindExistingDocument(
            documentType,
            documentNumber,
            issuingCountry);

        if (existingDocument is not null)
        {
            var traveler = db.Travelers.Single(
                item => item.TravelerId == existingDocument.TravelerId);

            if (existingDocument.IsCurrent)
            {
                MergeTraveler(
                    traveler,
                    nameZh,
                    nameEn,
                    input.BirthDate,
                    sex,
                    nationality,
                    documentType,
                    documentNumber,
                    now);
            }
            else
            {
                MergeTravelerIdentityOnly(
                    traveler,
                    nameZh,
                    nameEn,
                    input.BirthDate,
                    sex,
                    nationality,
                    now);
            }

            if (!string.IsNullOrWhiteSpace(nationalIdNumber))
            {
                traveler.NationalIdNumber =
                    nationalIdNumber;
            }

            existingDocument.NameZhOnDocument = nameZhOnDocument;
            existingDocument.NameEnOnDocument = nameEn;
            existingDocument.Nationality = nationality;
            existingDocument.ExpiryDate = input.ExpiryDate;
            existingDocument.VerifiedAt = input.VerifiedAt;

            db.SaveChanges();

            var matchingTravelers = FindTravelerMatches(
                nameZh,
                nameEn,
                input.BirthDate,
                sex,
                nationalIdNumber);

            traveler = ConsolidateTravelerMatches(
                matchingTravelers,
                nameZh,
                nameEn,
                input.BirthDate,
                sex,
                nationality,
                now);

            if (existingDocument.IsCurrent)
            {
                MergeTraveler(
                    traveler,
                    nameZh,
                    nameEn,
                    input.BirthDate,
                    sex,
                    nationality,
                    documentType,
                    documentNumber,
                    now);
            }

            db.SaveChanges();
            if (ownsTransaction)
            {
                transaction!.Commit();
            }

            return BuildResult(
                DocumentSaveAction.UpdatedExistingDocument,
                traveler,
                existingDocument);
        }

        var travelerMatches = FindTravelerMatches(
            nameZh,
            nameEn,
            input.BirthDate,
            sex,
            nationalIdNumber);

        TravelerRecord targetTraveler;
        DocumentSaveAction action;

        if (travelerMatches.Count > 0)
        {
            targetTraveler = ConsolidateTravelerMatches(
                travelerMatches,
                nameZh,
                nameEn,
                input.BirthDate,
                sex,
                nationality,
                now);

            MergeTraveler(
                targetTraveler,
                nameZh,
                nameEn,
                input.BirthDate,
                sex,
                nationality,
                documentType,
                documentNumber,
                now);

            if (!string.IsNullOrWhiteSpace(nationalIdNumber))
            {
                targetTraveler.NationalIdNumber =
                    nationalIdNumber;
            }

            var oldDocuments = db.DocumentVersions
                .Where(item =>
                    item.TravelerId == targetTraveler.TravelerId &&
                    item.DocumentType == documentType &&
                    item.IsCurrent)
                .ToList();

            foreach (var oldDocument in oldDocuments)
            {
                oldDocument.IsCurrent = false;
            }

            action = DocumentSaveAction.CreatedDocumentVersion;
        }
        else
        {
            targetTraveler = new TravelerRecord
            {
                TravelerId = Guid.NewGuid(),
                NameZh = nameZh,
                NameEn = nameEn,
                BirthDate = input.BirthDate,
                Gender = sex,
                Nationality = nationality,
                NationalIdNumber = nationalIdNumber,
                PersonalIdType = documentType,
                PersonalIdNumber = documentNumber,
                CreatedAt = now,
                UpdatedAt = now
            };

            db.Travelers.Add(targetTraveler);
            action = DocumentSaveAction.CreatedTravelerAndDocument;
        }

        var documentVersion = new DocumentVersionRecord
        {
            DocumentVersionId = Guid.NewGuid(),
            TravelerId = targetTraveler.TravelerId,
            DocumentType = documentType,
            NameZhOnDocument = nameZhOnDocument,
            NameEnOnDocument = nameEn,
            DocumentNumber = documentNumber,
            IssuingCountry = issuingCountry,
            Nationality = nationality,
            ExpiryDate = input.ExpiryDate,
            IsCurrent = true,
            VerifiedAt = input.VerifiedAt,
            CreatedAt = now
        };

        db.DocumentVersions.Add(documentVersion);
        db.SaveChanges();
        if (ownsTransaction)
            {
                transaction!.Commit();
            }

        return BuildResult(
            action,
            targetTraveler,
            documentVersion);
    }

    public IReadOnlyList<TravelerSummary> SearchTravelers(
        string? query,
        string? documentType,
        string? gender,
        string? nationality,
        int offset,
        int limit)
    {
        var safeOffset = Math.Max(0, offset);
        var safeLimit = Math.Clamp(limit, 1, 500);
        var trimmedQuery = query?.Trim() ?? string.Empty;
        var normalizedQuery = trimmedQuery.ToUpperInvariant();
        var normalizedDocumentType =
            NormalizeNullable(documentType);
        var normalizedGender =
            NormalizeNullable(gender);
        var normalizedNationality =
            NormalizeNullable(nationality);

        var allowedDocumentTypes = new HashSet<string>(
            StringComparer.Ordinal)
        {
            "PASSPORT",
            "TAIWAN_COMPATRIOT_PERMIT",
            "TAIWAN_NATIONAL_ID"
        };

        if (
            normalizedDocumentType is not null &&
            !allowedDocumentTypes.Contains(
                normalizedDocumentType))
        {
            throw new ArgumentException(
                "不支援的證件類別。",
                nameof(documentType));
        }

        if (
            normalizedGender is not null &&
            normalizedGender is not
                ("M" or "F" or "X"))
        {
            throw new ArgumentException(
                "性別篩選必須是 M、F 或 X。",
                nameof(gender));
        }

        var travelerQuery = db.Travelers.AsNoTracking();

        if (!string.IsNullOrEmpty(normalizedQuery))
        {
            var matchingTravelerIds = db.DocumentVersions
                .AsNoTracking()
                .Where(document =>
                    document.DocumentNumber.Contains(
                        normalizedQuery))
                .Select(document => document.TravelerId);

            travelerQuery = travelerQuery.Where(traveler =>
                traveler.NameZh.Contains(trimmedQuery) ||
                traveler.NameEn.Contains(normalizedQuery) ||
                traveler.PersonalIdNumber.Contains(
                    normalizedQuery) ||
                (traveler.NationalIdNumber != null &&
                 traveler.NationalIdNumber.Contains(
                     normalizedQuery)) ||
                matchingTravelerIds.Contains(
                    traveler.TravelerId));
        }

        if (normalizedDocumentType is not null)
        {
            var matchingTravelerIds = db.DocumentVersions
                .AsNoTracking()
                .Where(document =>
                    document.IsCurrent &&
                    document.DocumentType ==
                        normalizedDocumentType)
                .Select(document => document.TravelerId);

            travelerQuery = travelerQuery.Where(
                traveler =>
                    matchingTravelerIds.Contains(
                        traveler.TravelerId));
        }

        if (normalizedGender is not null)
        {
            travelerQuery = travelerQuery.Where(
                traveler =>
                    traveler.Gender ==
                        normalizedGender);
        }

        if (normalizedNationality is not null)
        {
            travelerQuery = travelerQuery.Where(
                traveler =>
                    traveler.Nationality != null &&
                    traveler.Nationality.Contains(
                        normalizedNationality));
        }

        var travelers = travelerQuery
            .OrderByDescending(
                traveler => traveler.UpdatedAt)
            .ThenBy(
                traveler => traveler.TravelerId)
            .Skip(safeOffset)
            .Take(safeLimit)
            .ToList();

        if (travelers.Count == 0)
        {
            return [];
        }

        var travelerIds = travelers
            .Select(item => item.TravelerId)
            .ToList();

        var documents = db.DocumentVersions
            .AsNoTracking()
            .Where(item =>
                travelerIds.Contains(item.TravelerId))
            .ToList();

        return travelers
            .Select(traveler =>
                BuildTravelerSummary(
                    traveler,
                    documents.Where(
                        document =>
                            document.TravelerId ==
                            traveler.TravelerId)))
            .ToList();
    }

    public TravelerDetail? GetTraveler(Guid travelerId)
    {
        var traveler = db.Travelers
            .AsNoTracking()
            .SingleOrDefault(
                item => item.TravelerId == travelerId);

        if (traveler is null)
        {
            return null;
        }

        var documents = db.DocumentVersions
            .AsNoTracking()
            .Where(item => item.TravelerId == travelerId)
            .OrderByDescending(item => item.IsCurrent)
            .ThenByDescending(item => item.CreatedAt)
            .ToList();

        return new TravelerDetail(
            BuildTravelerSummary(traveler, documents),
            documents
                .Select(item =>
                    new DocumentVersionSummary(
                        item.DocumentVersionId,
                        item.DocumentType,
                        item.NameZhOnDocument,
                        item.NameEnOnDocument,
                        item.DocumentNumber,
                        item.IssuingCountry,
                        item.Nationality,
                        item.ExpiryDate,
                        item.IsCurrent,
                        item.VerifiedAt,
                        item.CreatedAt))
                .ToList());
    }

    public TravelerDetail? UpdateTraveler(
        Guid travelerId,
        UpdateTravelerRequest request,
        DateTimeOffset now)
    {
        var traveler = db.Travelers.SingleOrDefault(
            item => item.TravelerId == travelerId);

        if (traveler is null)
        {
            return null;
        }

        var nameZh = NormalizeIdentityName(
            request.NameZh ?? string.Empty);
        var nameEn = Normalize(
            request.NameEn ?? string.Empty);

        if (!DateOnly.TryParseExact(
            request.BirthDate?.Trim(),
            "yyyy-MM-dd",
            CultureInfo.InvariantCulture,
            DateTimeStyles.None,
            out var birthDate))
        {
            throw new ArgumentException(
                "出生日期格式必須為 YYYY-MM-DD。");
        }

        var gender = Normalize(
            request.Gender ?? string.Empty);

        ValidateFormalIdentity(
            nameZh,
            nameEn,
            birthDate,
            gender,
            NormalizeNullable(request.Nationality),
            null,
            null,
            now);

        var effectiveNationalIdNumber =
            NormalizeNullable(
                request.NationalIdNumber);

        if (
            effectiveNationalIdNumber is not null &&
            !TaiwanNationalIdReviewValidator
                .IsValidNationalId(
                    effectiveNationalIdNumber))
        {
            throw new ArgumentException(
                "身分證字號格式或檢查碼不正確。");
        }

        var requestedDocumentKeys =
            new HashSet<string>(
                StringComparer.Ordinal);

        foreach (var update in request.Documents ??
            Array.Empty<UpdateTravelerDocumentRequest>())
        {
            var document = db.DocumentVersions
                .SingleOrDefault(item =>
                    item.DocumentVersionId ==
                        update.DocumentVersionId &&
                    item.TravelerId == travelerId);

            if (document is null)
            {
                throw new ArgumentException(
                    "包含不屬於此旅客的證件版本。");
            }

            var documentNumber = Normalize(
                update.DocumentNumber ??
                    string.Empty);

            if (string.IsNullOrWhiteSpace(
                documentNumber))
            {
                throw new ArgumentException(
                    "證件號碼不可空白。");
            }

            var issuingCountry =
                NormalizeNullable(
                    update.IssuingCountry);

            if (
                document.DocumentType ==
                    "TAIWAN_NATIONAL_ID")
            {
                if (
                    !TaiwanNationalIdReviewValidator
                        .IsValidNationalId(
                            documentNumber))
                {
                    throw new ArgumentException(
                        "身分證證件號碼格式或檢查碼不正確。");
                }

                if (
                    effectiveNationalIdNumber is not null &&
                    effectiveNationalIdNumber !=
                        documentNumber)
                {
                    throw new ArgumentException(
                        "旅客主檔身分證字號與目前身分證證件號碼不一致。");
                }

                effectiveNationalIdNumber =
                    documentNumber;
            }

            var requestedKey =
                document.DocumentType ==
                    "PASSPORT"
                    ? $"{document.DocumentType}|{documentNumber}|{issuingCountry ?? string.Empty}"
                    : $"{document.DocumentType}|{documentNumber}";

            if (!requestedDocumentKeys.Add(
                requestedKey))
            {
                throw new ArgumentException(
                    "同一次修改中出現重複的證件號碼。");
            }

            var conflictingDocument =
                db.DocumentVersions
                    .AsNoTracking()
                    .Where(item =>
                        item.DocumentVersionId !=
                            document.DocumentVersionId &&
                        item.DocumentType ==
                            document.DocumentType &&
                        item.DocumentNumber ==
                            documentNumber &&
                        (
                            document.DocumentType !=
                                "PASSPORT" ||
                            item.IssuingCountry ==
                                issuingCountry
                        ))
                    .Select(item => new
                    {
                        item.TravelerId,
                        item.DocumentVersionId
                    })
                    .FirstOrDefault();

            if (conflictingDocument is not null)
            {
                throw new ArgumentException(
                    conflictingDocument.TravelerId ==
                        travelerId
                        ? "此證件號碼已存在於同一旅客的另一個證件版本，請先確認歷史版本。"
                        : "此證件號碼已屬於另一位旅客，請先確認是否應使用「旅客合併」。");
            }

            DateOnly? expiryDate = null;

            if (!string.IsNullOrWhiteSpace(
                update.ExpiryDate))
            {
                if (!DateOnly.TryParseExact(
                    update.ExpiryDate.Trim(),
                    "yyyy-MM-dd",
                    CultureInfo.InvariantCulture,
                    DateTimeStyles.None,
                    out var parsedExpiry))
                {
                    throw new ArgumentException(
                        "證件有效期限格式必須為 YYYY-MM-DD。");
                }

                expiryDate = parsedExpiry;
            }

            var updatedNameEn =
                Normalize(
                    update.NameEnOnDocument ??
                    string.Empty);
            var updatedNationality =
                NormalizeNullable(
                    update.Nationality);

            ValidateDocumentFields(
                document.DocumentType,
                documentNumber,
                updatedNameEn,
                updatedNationality,
                issuingCountry,
                expiryDate,
                birthDate);

            document.NameZhOnDocument =
                NormalizeIdentityName(
                    update.NameZhOnDocument ??
                    string.Empty);
            document.NameEnOnDocument =
                updatedNameEn;
            document.DocumentNumber =
                documentNumber;
            document.IssuingCountry =
                issuingCountry;
            document.Nationality =
                updatedNationality;
            document.ExpiryDate = expiryDate;
            document.VerifiedAt = now;

            if (
                document.IsCurrent &&
                traveler.PersonalIdType ==
                    document.DocumentType)
            {
                traveler.PersonalIdNumber =
                    documentNumber;
            }
        }

        if (
            effectiveNationalIdNumber is not null)
        {
            ValidateNationalIdGender(
                effectiveNationalIdNumber,
                gender);

            var duplicateNationalId =
                db.Travelers
                    .AsNoTracking()
                    .Any(item =>
                        item.TravelerId != travelerId &&
                        item.NationalIdNumber ==
                            effectiveNationalIdNumber);

            if (duplicateNationalId)
            {
                throw new ArgumentException(
                    "此身分證字號已屬於另一位旅客，請先確認是否應使用「旅客合併」。");
            }
        }

        traveler.NameZh = nameZh;
        traveler.NameEn = nameEn;
        traveler.BirthDate = birthDate;
        traveler.Gender = gender;
        traveler.Nationality =
            NormalizeNullable(
                request.Nationality);
        traveler.NationalIdNumber =
            effectiveNationalIdNumber;
        traveler.UpdatedAt = now;

        db.SaveChanges();

        var travelerDocumentIds = db.DocumentVersions
            .AsNoTracking()
            .Where(item =>
                item.TravelerId == travelerId)
            .Select(item =>
                item.DocumentVersionId)
            .ToList();

        var linkedScanItems = db.ScanItems
            .Where(item =>
                item.SavedDocumentVersionId.HasValue &&
                travelerDocumentIds.Contains(
                    item.SavedDocumentVersionId.Value))
            .ToList();

        var documentById = db.DocumentVersions
            .AsNoTracking()
            .Where(item =>
                travelerDocumentIds.Contains(
                    item.DocumentVersionId))
            .ToDictionary(
                item => item.DocumentVersionId);

        foreach (var scanItem in linkedScanItems)
        {
            if (
                !scanItem.SavedDocumentVersionId.HasValue ||
                !documentById.TryGetValue(
                    scanItem.SavedDocumentVersionId.Value,
                    out var document))
            {
                continue;
            }

            scanItem.NameZh =
                traveler.NameZh;
            scanItem.NameZhOnDocument =
                document.NameZhOnDocument;
            scanItem.NameEn =
                document.NameEnOnDocument;
            scanItem.BirthDate =
                traveler.BirthDate;
            scanItem.Gender =
                traveler.Gender;
            scanItem.Nationality =
                document.Nationality;
            scanItem.NationalIdNumber =
                traveler.NationalIdNumber;
            scanItem.DocumentNumber =
                document.DocumentNumber;
            scanItem.IssuingCountry =
                document.IssuingCountry;
            scanItem.ExpiryDate =
                document.ExpiryDate;
            scanItem.UpdatedAt = now;
        }

        var linkedDraftIds = linkedScanItems
            .Select(item => item.DraftPersonId)
            .Distinct()
            .ToList();

        var linkedDrafts = db.TourPersonDrafts
            .Where(item =>
                linkedDraftIds.Contains(
                    item.DraftPersonId))
            .ToList();

        foreach (var draft in linkedDrafts)
        {
            draft.NameZh =
                traveler.NameZh;
            draft.BirthDate =
                traveler.BirthDate;
            draft.Gender =
                traveler.Gender;
            draft.UpdatedAt = now;
        }

        db.SaveChanges();

        foreach (var scanItem in linkedScanItems)
        {
            trainingDatasetStore.RefreshSelectedSample(
                scanItem.ScanItemId,
                now);
        }

        return GetTraveler(travelerId);
    }

    public TravelerDetail? MergeTravelers(
        Guid targetTravelerId,
        Guid sourceTravelerId,
        DateTimeOffset now)
    {
        if (targetTravelerId == sourceTravelerId)
        {
            throw new ArgumentException(
                "保留旅客與併入旅客不能是同一筆。");
        }

        using var transaction =
            db.Database.BeginTransaction();

        var target = db.Travelers.SingleOrDefault(
            item =>
                item.TravelerId ==
                    targetTravelerId);
        var source = db.Travelers.SingleOrDefault(
            item =>
                item.TravelerId ==
                    sourceTravelerId);

        if (target is null || source is null)
        {
            return null;
        }

        if (target.BirthDate != source.BirthDate)
        {
            throw new ArgumentException(
                "兩筆旅客出生日期不同，請先修正資料後再合併。");
        }

        if (!string.Equals(
            target.Gender,
            source.Gender,
            StringComparison.Ordinal))
        {
            throw new ArgumentException(
                "兩筆旅客性別不同，請先修正資料後再合併。");
        }

        if (
            !string.IsNullOrWhiteSpace(
                target.NationalIdNumber) &&
            !string.IsNullOrWhiteSpace(
                source.NationalIdNumber) &&
            !string.Equals(
                target.NationalIdNumber,
                source.NationalIdNumber,
                StringComparison.Ordinal))
        {
            throw new ArgumentException(
                "兩筆旅客都有身分證字號且內容不同，為避免誤合併，請先確認並修正資料。");
        }

        if (
            string.IsNullOrWhiteSpace(target.NameEn) &&
            !string.IsNullOrWhiteSpace(source.NameEn))
        {
            target.NameEn = source.NameEn;
        }

        if (
            string.IsNullOrWhiteSpace(target.Nationality) &&
            !string.IsNullOrWhiteSpace(
                source.Nationality))
        {
            target.Nationality =
                source.Nationality;
        }

        if (
            string.IsNullOrWhiteSpace(
                target.NationalIdNumber) &&
            !string.IsNullOrWhiteSpace(
                source.NationalIdNumber))
        {
            target.NationalIdNumber =
                source.NationalIdNumber;
        }

        var sourceDocuments = db.DocumentVersions
            .Where(item =>
                item.TravelerId ==
                    sourceTravelerId)
            .ToList();

        foreach (var document in sourceDocuments)
        {
            document.TravelerId =
                targetTravelerId;
        }

        var targetMemberships = db.TourMembers
            .Where(item =>
                item.TravelerId ==
                    targetTravelerId)
            .ToDictionary(
                item => item.TourId);

        var sourceMemberships = db.TourMembers
            .Where(item =>
                item.TravelerId ==
                    sourceTravelerId)
            .ToList();

        foreach (var membership in sourceMemberships)
        {
            if (
                targetMemberships.TryGetValue(
                    membership.TourId,
                    out var targetMembership))
            {
                MergeMemberDocuments(
                    membership.TourMemberId,
                    targetMembership.TourMemberId,
                    now);

                db.TourMembers.Remove(
                    membership);
                continue;
            }

            membership.TravelerId =
                targetTravelerId;
            targetMemberships[
                membership.TourId] =
                    membership;
        }

        db.Travelers.Remove(source);
        target.UpdatedAt = now;

        db.SaveChanges();

        ReconcileCurrentDocuments(
            targetTravelerId);
        SyncTravelerScansAndDrafts(
            target,
            now);

        db.SaveChanges();
        transaction.Commit();

        return GetTraveler(
            targetTravelerId);
    }

    private DocumentVersionRecord? FindExistingDocument(
        string documentType,
        string documentNumber,
        string? issuingCountry)
    {
        var query = db.DocumentVersions.Where(
            document =>
                document.DocumentType ==
                    documentType &&
                document.DocumentNumber ==
                    documentNumber);

        if (documentType == "PASSPORT")
        {
            query = query.Where(
                document =>
                    document.IssuingCountry ==
                        issuingCountry);
        }

        var matches = query
            .OrderByDescending(
                document => document.IsCurrent)
            .ThenByDescending(
                document => document.VerifiedAt)
            .ThenByDescending(
                document => document.CreatedAt)
            .ToList();

        if (matches.Count <= 1)
        {
            return matches.FirstOrDefault();
        }

        var travelerCount = matches
            .Select(document =>
                document.TravelerId)
            .Distinct()
            .Count();

        if (travelerCount > 1)
        {
            throw new AmbiguousTravelerMatchException(
                "同一證件號碼存在於多位旅客主檔，系統不會自動選擇；請先到「旅客資料」確認並人工合併。");
        }

        return matches[0];
    }

    private List<TravelerRecord> FindTravelerMatches(
        string nameZh,
        string nameEn,
        DateOnly birthDate,
        string sex,
        string? nationalIdNumber)
    {
        if (!string.IsNullOrWhiteSpace(nationalIdNumber))
        {
            var idMatches = db.Travelers
                .Where(traveler =>
                    traveler.NationalIdNumber ==
                        nationalIdNumber)
                .OrderBy(traveler =>
                    traveler.CreatedAt)
                .ThenBy(traveler =>
                    traveler.TravelerId)
                .ToList();

            if (idMatches.Count > 0)
            {
                return idMatches;
            }
        }

        List<TravelerRecord> identityMatches;

        if (!string.IsNullOrWhiteSpace(nameZh))
        {
            identityMatches = db.Travelers
                .Where(traveler =>
                    traveler.NameZh == nameZh &&
                    traveler.BirthDate == birthDate &&
                    traveler.Gender == sex)
                .OrderBy(traveler =>
                    traveler.CreatedAt)
                .ThenBy(traveler =>
                    traveler.TravelerId)
                .ToList();
        }
        else if (!string.IsNullOrWhiteSpace(nameEn))
        {
            identityMatches = db.Travelers
                .Where(traveler =>
                    traveler.NameZh == string.Empty &&
                    traveler.NameEn == nameEn &&
                    traveler.BirthDate == birthDate &&
                    traveler.Gender == sex)
                .OrderBy(traveler =>
                    traveler.CreatedAt)
                .ThenBy(traveler =>
                    traveler.TravelerId)
                .ToList();
        }
        else
        {
            return [];
        }

        if (!string.IsNullOrWhiteSpace(nationalIdNumber))
        {
            identityMatches = identityMatches
                .Where(traveler =>
                    string.IsNullOrWhiteSpace(
                        traveler.NationalIdNumber) ||
                    traveler.NationalIdNumber ==
                        nationalIdNumber)
                .ToList();
        }

        if (identityMatches.Count > 1)
        {
            throw new AmbiguousTravelerMatchException();
        }

        return identityMatches;
    }

    private TravelerRecord ConsolidateTravelerMatches(
        IReadOnlyList<TravelerRecord> matches,
        string nameZh,
        string nameEn,
        DateOnly birthDate,
        string sex,
        string? nationality,
        DateTimeOffset now)
    {
        if (matches.Count == 0)
        {
            throw new InvalidOperationException(
                "Cannot consolidate an empty traveler match set.");
        }

        var canonical = matches
            .OrderBy(item => item.CreatedAt)
            .ThenBy(item => item.TravelerId)
            .First();

        MergeTravelerIdentityOnly(
            canonical,
            nameZh,
            nameEn,
            birthDate,
            sex,
            nationality,
            now);

        var canonicalMemberships = db.TourMembers
            .Where(item =>
                item.TravelerId ==
                    canonical.TravelerId)
            .ToDictionary(
                item => item.TourId);

        foreach (var duplicate in matches.Where(
            item => item.TravelerId != canonical.TravelerId))
        {
            if (
                string.IsNullOrWhiteSpace(canonical.NameEn) &&
                !string.IsNullOrWhiteSpace(duplicate.NameEn))
            {
                canonical.NameEn = duplicate.NameEn;
            }

            if (
                string.IsNullOrWhiteSpace(canonical.Nationality) &&
                !string.IsNullOrWhiteSpace(duplicate.Nationality))
            {
                canonical.Nationality = duplicate.Nationality;
            }

            if (
                string.IsNullOrWhiteSpace(canonical.NationalIdNumber) &&
                !string.IsNullOrWhiteSpace(duplicate.NationalIdNumber))
            {
                canonical.NationalIdNumber =
                    duplicate.NationalIdNumber;
            }

            var duplicateDocuments = db.DocumentVersions
                .Where(item => item.TravelerId == duplicate.TravelerId)
                .ToList();

            foreach (var document in duplicateDocuments)
            {
                document.TravelerId = canonical.TravelerId;
            }

            var duplicateMemberships = db.TourMembers
                .Where(item => item.TravelerId == duplicate.TravelerId)
                .ToList();

            foreach (var membership in duplicateMemberships)
            {
                if (
                    canonicalMemberships.TryGetValue(
                        membership.TourId,
                        out var targetMembership))
                {
                    MergeMemberDocuments(
                        membership.TourMemberId,
                        targetMembership.TourMemberId,
                        now);

                    db.TourMembers.Remove(membership);
                    continue;
                }

                membership.TravelerId =
                    canonical.TravelerId;
                canonicalMemberships[
                    membership.TourId] =
                        membership;
            }

            db.Travelers.Remove(duplicate);
        }

        db.SaveChanges();
        ReconcileCurrentDocuments(canonical.TravelerId);

        canonical.UpdatedAt = now;
        db.SaveChanges();

        return canonical;
    }

    private void SyncTravelerScansAndDrafts(
        TravelerRecord traveler,
        DateTimeOffset now)
    {
        var documentIds = db.DocumentVersions
            .AsNoTracking()
            .Where(item =>
                item.TravelerId ==
                    traveler.TravelerId)
            .Select(item =>
                item.DocumentVersionId)
            .ToList();

        var documentById = db.DocumentVersions
            .AsNoTracking()
            .Where(item =>
                documentIds.Contains(
                    item.DocumentVersionId))
            .ToDictionary(
                item => item.DocumentVersionId);

        var reviewedItems = db.ScanItems
            .Where(item =>
                item.SavedDocumentVersionId.HasValue &&
                documentIds.Contains(
                    item.SavedDocumentVersionId.Value))
            .ToList();

        foreach (var scanItem in reviewedItems)
        {
            if (
                !scanItem.SavedDocumentVersionId.HasValue ||
                !documentById.TryGetValue(
                    scanItem.SavedDocumentVersionId.Value,
                    out var document))
            {
                continue;
            }

            scanItem.NameZh =
                traveler.NameZh;
            scanItem.NameZhOnDocument =
                document.NameZhOnDocument;
            scanItem.NameEn =
                document.NameEnOnDocument;
            scanItem.BirthDate =
                traveler.BirthDate;
            scanItem.Gender =
                traveler.Gender;
            scanItem.Nationality =
                document.Nationality;
            scanItem.NationalIdNumber =
                traveler.NationalIdNumber;
            scanItem.DocumentNumber =
                document.DocumentNumber;
            scanItem.IssuingCountry =
                document.IssuingCountry;
            scanItem.ExpiryDate =
                document.ExpiryDate;
            scanItem.UpdatedAt = now;
        }

        var linkedDraftIds = reviewedItems
            .Select(item => item.DraftPersonId)
            .Distinct()
            .ToList();

        var linkedDrafts = db.TourPersonDrafts
            .Where(item =>
                linkedDraftIds.Contains(
                    item.DraftPersonId))
            .OrderBy(item => item.CreatedAt)
            .ThenBy(item => item.DraftPersonId)
            .ToList();

        foreach (var group in linkedDrafts.GroupBy(
            item => item.TourId))
        {
            var canonical = group.First();

            canonical.NameZh =
                traveler.NameZh;
            canonical.BirthDate =
                traveler.BirthDate;
            canonical.Gender =
                traveler.Gender;
            canonical.UpdatedAt = now;

            foreach (var duplicate in group.Skip(1))
            {
                var draftItems = db.ScanItems
                    .Where(item =>
                        item.DraftPersonId ==
                            duplicate.DraftPersonId)
                    .ToList();

                foreach (var item in draftItems)
                {
                    item.DraftPersonId =
                        canonical.DraftPersonId;
                    item.UpdatedAt = now;
                }

                db.TourPersonDrafts.Remove(
                    duplicate);
            }
        }

        db.SaveChanges();

        foreach (var scanItem in reviewedItems)
        {
            trainingDatasetStore.RefreshSelectedSample(
                scanItem.ScanItemId,
                now);
        }
    }

    private void MergeMemberDocuments(
        Guid sourceTourMemberId,
        Guid targetTourMemberId,
        DateTimeOffset now)
    {
        var targetLinks = db.TourMemberDocuments
            .Where(item =>
                item.TourMemberId ==
                    targetTourMemberId)
            .ToDictionary(
                item => item.DocumentType,
                StringComparer.Ordinal);

        var sourceLinks = db.TourMemberDocuments
            .Where(item =>
                item.TourMemberId ==
                    sourceTourMemberId)
            .ToList();

        foreach (var sourceLink in sourceLinks)
        {
            if (
                targetLinks.TryGetValue(
                    sourceLink.DocumentType,
                    out var targetLink))
            {
                if (
                    sourceLink.UpdatedAt >
                        targetLink.UpdatedAt)
                {
                    targetLink.DocumentVersionId =
                        sourceLink.DocumentVersionId;
                    targetLink.UpdatedAt = now;
                }

                db.TourMemberDocuments.Remove(
                    sourceLink);
                continue;
            }

            sourceLink.TourMemberId =
                targetTourMemberId;
            sourceLink.UpdatedAt = now;
            targetLinks[sourceLink.DocumentType] =
                sourceLink;
        }
    }

    private void ReconcileCurrentDocuments(Guid travelerId)
    {
        var currentDocuments = db.DocumentVersions
            .Where(item =>
                item.TravelerId == travelerId &&
                item.IsCurrent)
            .OrderByDescending(item => item.VerifiedAt)
            .ThenByDescending(item => item.CreatedAt)
            .ToList();

        foreach (var group in currentDocuments.GroupBy(
            item => item.DocumentType,
            StringComparer.Ordinal))
        {
            foreach (var oldDocument in group.Skip(1))
            {
                oldDocument.IsCurrent = false;
            }
        }
    }

    private DocumentSaveResult BuildResult(
        DocumentSaveAction action,
        TravelerRecord traveler,
        DocumentVersionRecord document)
    {
        var versionCount = db.DocumentVersions.Count(
            item => item.TravelerId == traveler.TravelerId);

        return new DocumentSaveResult(
            action,
            traveler.TravelerId,
            document.DocumentVersionId,
            versionCount);
    }

    private static TravelerSummary BuildTravelerSummary(
        TravelerRecord traveler,
        IEnumerable<DocumentVersionRecord> documents)
    {
        var travelerDocuments = documents.ToList();

        var currentTypes = travelerDocuments
            .Where(item => item.IsCurrent)
            .Select(item => item.DocumentType)
            .Distinct(StringComparer.Ordinal)
            .OrderBy(value => value)
            .ToList();

        return new TravelerSummary(
            traveler.TravelerId,
            traveler.NameZh,
            traveler.NameEn,
            traveler.BirthDate,
            traveler.Gender,
            traveler.Nationality,
            traveler.NationalIdNumber,
            travelerDocuments.Count,
            currentTypes);
    }

    private static void MergeTraveler(
        TravelerRecord traveler,
        string nameZh,
        string nameEn,
        DateOnly birthDate,
        string sex,
        string? nationality,
        string documentType,
        string documentNumber,
        DateTimeOffset now)
    {
        MergeTravelerIdentityOnly(
            traveler,
            nameZh,
            nameEn,
            birthDate,
            sex,
            nationality,
            now);

        traveler.PersonalIdType = documentType;
        traveler.PersonalIdNumber = documentNumber;
    }

    private static void MergeTravelerIdentityOnly(
        TravelerRecord traveler,
        string nameZh,
        string nameEn,
        DateOnly birthDate,
        string sex,
        string? nationality,
        DateTimeOffset now)
    {
        if (!string.IsNullOrWhiteSpace(nameZh))
        {
            traveler.NameZh = nameZh;
        }

        if (!string.IsNullOrWhiteSpace(nameEn))
        {
            traveler.NameEn = nameEn;
        }

        traveler.BirthDate = birthDate;

        if (!string.IsNullOrWhiteSpace(sex))
        {
            traveler.Gender = sex;
        }

        if (!string.IsNullOrWhiteSpace(nationality))
        {
            traveler.Nationality = nationality;
        }

        traveler.UpdatedAt = now;
    }

    private static void ValidateFormalIdentity(
        string nameZh,
        string nameEn,
        DateOnly birthDate,
        string gender,
        string? nationality,
        string? documentType,
        string? issuingCountry,
        DateTimeOffset now)
    {
        if (
            string.IsNullOrWhiteSpace(nameZh) &&
            string.IsNullOrWhiteSpace(nameEn))
        {
            throw new ArgumentException(
                "旅客中文姓名與英文姓名不可同時空白。");
        }

        var requiresChineseName =
            documentType is
                "TAIWAN_COMPATRIOT_PERMIT" or
                "TAIWAN_NATIONAL_ID" ||
            (
                documentType == "PASSPORT" &&
                (
                    nationality == "TWN" ||
                    issuingCountry == "TWN"
                )
            );

        if (
            requiresChineseName &&
            string.IsNullOrWhiteSpace(nameZh))
        {
            throw new ArgumentException(
                "此證件流程必須確認旅客中文姓名。");
        }

        if (
            birthDate >
            BusinessDate.Taiwan(now))
        {
            throw new ArgumentException(
                "出生日期不可晚於目前日期。");
        }

        if (gender is not ("M" or "F" or "X"))
        {
            throw new ArgumentException(
                "旅客性別必須為 M、F 或 X。");
        }

        ValidateCountryCode(
            nationality,
            "國籍",
            required: false);
    }

    private static void ValidateDocumentFields(
        string documentType,
        string documentNumber,
        string nameEn,
        string? nationality,
        string? issuingCountry,
        DateOnly? expiryDate,
        DateOnly birthDate)
    {
        if (
            documentType is not (
                "PASSPORT" or
                "TAIWAN_COMPATRIOT_PERMIT" or
                "TAIWAN_NATIONAL_ID"))
        {
            throw new ArgumentException(
                "不支援的證件類型。");
        }

        if (documentType == "PASSPORT")
        {
            if (
                documentNumber.Length is < 5 or > 20 ||
                !documentNumber.All(character =>
                    character is >= 'A' and <= 'Z' ||
                    character is >= '0' and <= '9'))
            {
                throw new ArgumentException(
                    "護照號碼格式不正確。");
            }

            if (string.IsNullOrWhiteSpace(nameEn))
            {
                throw new ArgumentException(
                    "護照英文姓名不可空白。");
            }

            ValidateCountryCode(
                nationality,
                "護照國籍",
                required: true);
            ValidateCountryCode(
                issuingCountry,
                "護照簽發國",
                required: true);

            if (!expiryDate.HasValue)
            {
                throw new ArgumentException(
                    "護照有效期限不可空白。");
            }
        }
        else if (
            documentType ==
                "TAIWAN_COMPATRIOT_PERMIT")
        {
            if (
                documentNumber.Length != 8 ||
                !documentNumber.All(
                    char.IsDigit))
            {
                throw new ArgumentException(
                    "台胞證號碼必須為 8 位數字。");
            }

            if (!expiryDate.HasValue)
            {
                throw new ArgumentException(
                    "台胞證有效期限不可空白。");
            }

            if (expiryDate.Value <= birthDate)
            {
                throw new ArgumentException(
                    "台胞證有效期限必須晚於出生日期。");
            }
        }
        else if (expiryDate.HasValue)
        {
            throw new ArgumentException(
                "台灣身分證沒有有效期限。");
        }
    }

    private static void ValidateCountryCode(
        string? value,
        string label,
        bool required)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            if (required)
            {
                throw new ArgumentException(
                    $"{label}不可空白。");
            }

            return;
        }

        if (
            value.Length != 3 ||
            !value.All(character =>
                character is >= 'A' and <= 'Z'))
        {
            throw new ArgumentException(
                $"{label}必須為 3 碼大寫英文字母。");
        }
    }

    private static void ValidateNationalIdGender(
        string nationalIdNumber,
        string gender)
    {
        if (gender is not ("M" or "F"))
        {
            return;
        }

        var expectedGender =
            nationalIdNumber[1] == '1'
                ? "M"
                : "F";

        if (gender != expectedGender)
        {
            throw new ArgumentException(
                "性別與國民身分證統一編號第 2 碼不一致。");
        }
    }

    private static string NormalizeIdentityName(string value) =>
        string.Concat(
            value.Trim().Where(character => !char.IsWhiteSpace(character)));

    private static string Normalize(string value) =>
        value.Trim().ToUpperInvariant();

    private static string? NormalizeNullable(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        return value.Trim().ToUpperInvariant();
    }
}
