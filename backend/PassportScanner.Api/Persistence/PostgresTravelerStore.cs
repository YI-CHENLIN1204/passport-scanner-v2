using Microsoft.EntityFrameworkCore;
using PassportScanner.Api.Domain;

namespace PassportScanner.Api.Persistence;

public sealed class PostgresTravelerStore(
    PassportScannerDbContext db)
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
        var nameZh = input.ChineseName.Trim();
        var nameEn = Normalize(input.EnglishName);
        var documentNumber = Normalize(input.DocumentNumber);
        var nationality = NormalizeNullable(input.Nationality);
        var issuingCountry = NormalizeNullable(input.IssuingCountry);
        var sex = Normalize(input.Sex);

        using var transaction = db.Database.BeginTransaction();

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

            existingDocument.NameZhOnDocument = nameZh;
            existingDocument.NameEnOnDocument = nameEn;
            existingDocument.Nationality = nationality;
            existingDocument.ExpiryDate = input.ExpiryDate;
            existingDocument.VerifiedAt = input.VerifiedAt;

            db.SaveChanges();
            transaction.Commit();

            return BuildResult(
                DocumentSaveAction.UpdatedExistingDocument,
                traveler,
                existingDocument);
        }

        var travelerMatches = FindTravelerMatches(
            nameZh,
            nameEn,
            input.BirthDate,
            nationality);

        if (travelerMatches.Count > 1)
        {
            throw new AmbiguousTravelerMatchException();
        }

        TravelerRecord targetTraveler;
        DocumentSaveAction action;

        if (travelerMatches.Count == 1)
        {
            targetTraveler = travelerMatches[0];

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
            NameZhOnDocument = nameZh,
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
        transaction.Commit();

        return BuildResult(
            action,
            targetTraveler,
            documentVersion);
    }

    public IReadOnlyList<TravelerSummary> SearchTravelers(
        string? query,
        int limit)
    {
        var safeLimit = Math.Clamp(limit, 1, 50);
        var trimmedQuery = query?.Trim() ?? string.Empty;
        var normalizedQuery = trimmedQuery.ToUpperInvariant();

        var travelerQuery = db.Travelers.AsNoTracking();

        if (!string.IsNullOrEmpty(normalizedQuery))
        {
            var matchingTravelerIds = db.DocumentVersions
                .AsNoTracking()
                .Where(document =>
                    document.DocumentNumber.Contains(normalizedQuery))
                .Select(document => document.TravelerId);

            travelerQuery = travelerQuery.Where(traveler =>
                traveler.NameZh.Contains(trimmedQuery) ||
                traveler.NameEn.Contains(normalizedQuery) ||
                traveler.PersonalIdNumber.Contains(normalizedQuery) ||
                matchingTravelerIds.Contains(traveler.TravelerId));
        }

        var travelers = travelerQuery
            .OrderByDescending(traveler => traveler.UpdatedAt)
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
            .Where(item => travelerIds.Contains(item.TravelerId))
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

    private DocumentVersionRecord? FindExistingDocument(
        string documentType,
        string documentNumber,
        string? issuingCountry)
    {
        var query = db.DocumentVersions.Where(
            document =>
                document.DocumentType == documentType &&
                document.DocumentNumber == documentNumber);

        if (documentType == "PASSPORT")
        {
            query = query.Where(
                document =>
                    document.IssuingCountry == issuingCountry);
        }

        return query.SingleOrDefault();
    }

    private List<TravelerRecord> FindTravelerMatches(
        string nameZh,
        string nameEn,
        DateOnly birthDate,
        string? nationality)
    {
        var query = db.Travelers
            .Where(traveler =>
                traveler.BirthDate == birthDate);

        if (!string.IsNullOrWhiteSpace(nameZh))
        {
            query = query.Where(
                traveler => traveler.NameZh == nameZh);
        }
        else if (!string.IsNullOrWhiteSpace(nameEn))
        {
            query = query.Where(
                traveler => traveler.NameEn == nameEn);
        }
        else
        {
            return [];
        }

        if (!string.IsNullOrWhiteSpace(nationality))
        {
            query = query.Where(
                traveler =>
                    traveler.Nationality == null ||
                    traveler.Nationality == nationality);
        }

        return query.ToList();
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
