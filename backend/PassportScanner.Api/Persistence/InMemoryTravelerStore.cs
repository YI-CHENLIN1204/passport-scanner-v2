using PassportScanner.Api.Domain;

namespace PassportScanner.Api.Persistence;

public sealed class InMemoryTravelerStore : ITravelerStore
{
    private readonly object _gate = new();
    private readonly List<TravelerRecord> _travelers = [];
    private readonly List<DocumentVersionRecord> _documents = [];

    public int TravelerCount
    {
        get
        {
            lock (_gate)
            {
                return _travelers.Count;
            }
        }
    }

    public int DocumentVersionCount
    {
        get
        {
            lock (_gate)
            {
                return _documents.Count;
            }
        }
    }

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

        lock (_gate)
        {
            var existingDocument = FindExistingDocument(
                documentType,
                documentNumber,
                issuingCountry);

            if (existingDocument is not null)
            {
                var traveler = _travelers.Single(
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

                foreach (var oldDocument in _documents.Where(
                             item =>
                                 item.TravelerId == targetTraveler.TravelerId &&
                                 item.DocumentType == documentType))
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

                _travelers.Add(targetTraveler);
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

            _documents.Add(documentVersion);

            return BuildResult(
                action,
                targetTraveler,
                documentVersion);
        }
    }

    private DocumentVersionRecord? FindExistingDocument(
        string documentType,
        string documentNumber,
        string? issuingCountry)
    {
        return _documents.SingleOrDefault(
            document =>
                document.DocumentType == documentType &&
                document.DocumentNumber == documentNumber &&
                (
                    documentType != "PASSPORT" ||
                    document.IssuingCountry == issuingCountry
                ));
    }

    private List<TravelerRecord> FindTravelerMatches(
        string nameZh,
        string nameEn,
        DateOnly birthDate,
        string? nationality)
    {
        return _travelers
            .Where(
                traveler =>
                    traveler.BirthDate == birthDate &&
                    IdentityNameMatches(
                        traveler,
                        nameZh,
                        nameEn) &&
                    NationalityCompatible(
                        traveler.Nationality,
                        nationality))
            .ToList();
    }

    private static bool IdentityNameMatches(
        TravelerRecord traveler,
        string nameZh,
        string nameEn)
    {
        if (!string.IsNullOrWhiteSpace(nameZh))
        {
            return traveler.NameZh == nameZh;
        }

        if (!string.IsNullOrWhiteSpace(nameEn))
        {
            return traveler.NameEn == nameEn;
        }

        return false;
    }

    private static bool NationalityCompatible(
        string? existing,
        string? incoming)
    {
        if (string.IsNullOrWhiteSpace(existing) ||
            string.IsNullOrWhiteSpace(incoming))
        {
            return true;
        }

        return existing == incoming;
    }

    private DocumentSaveResult BuildResult(
        DocumentSaveAction action,
        TravelerRecord traveler,
        DocumentVersionRecord document)
    {
        var versionCount = _documents.Count(
            item => item.TravelerId == traveler.TravelerId);

        return new DocumentSaveResult(
            action,
            traveler.TravelerId,
            document.DocumentVersionId,
            versionCount);
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
