using System.Globalization;
using PassportScanner.Api.Contracts;
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

    public PassportSaveResult SavePassportReview(
        PassportReviewRequest request,
        DateTimeOffset now)
    {
        var birthDate = DateOnly.ParseExact(
            request.BirthDate,
            "yyyy-MM-dd",
            CultureInfo.InvariantCulture);

        var expiryDate = DateOnly.ParseExact(
            request.ExpiryDate,
            "yyyy-MM-dd",
            CultureInfo.InvariantCulture);

        var name = Normalize(request.EnglishName);
        var passportNumber = Normalize(request.PassportNumber);
        var nationality = Normalize(request.Nationality);
        var issuingState = Normalize(request.IssuingState);
        var sex = Normalize(request.Sex);

        lock (_gate)
        {
            var existingDocument = _documents.SingleOrDefault(
                document =>
                    document.DocumentType == "PASSPORT" &&
                    document.DocumentNumber == passportNumber &&
                    document.IssuingCountry == issuingState);

            if (existingDocument is not null)
            {
                var traveler = _travelers.Single(
                    item => item.TravelerId == existingDocument.TravelerId);

                UpdateTraveler(
                    traveler,
                    name,
                    birthDate,
                    sex,
                    nationality,
                    passportNumber,
                    now);

                existingDocument.Nationality = nationality;
                existingDocument.ExpiryDate = expiryDate;
                existingDocument.VerifiedAt = now;
                existingDocument.IsCurrent = true;

                var versionCount = _documents.Count(
                    item => item.TravelerId == traveler.TravelerId);

                return new PassportSaveResult(
                    PassportSaveAction.UpdatedExistingDocument,
                    traveler.TravelerId,
                    existingDocument.DocumentVersionId,
                    versionCount);
            }

            var travelerMatches = _travelers
                .Where(
                    traveler =>
                        traveler.NameEn == name &&
                        traveler.BirthDate == birthDate &&
                        traveler.Nationality == nationality)
                .ToList();

            if (travelerMatches.Count > 1)
            {
                throw new AmbiguousTravelerMatchException();
            }

            TravelerRecord targetTraveler;
            PassportSaveAction action;

            if (travelerMatches.Count == 1)
            {
                targetTraveler = travelerMatches[0];

                UpdateTraveler(
                    targetTraveler,
                    name,
                    birthDate,
                    sex,
                    nationality,
                    passportNumber,
                    now);

                foreach (var oldDocument in _documents.Where(
                             item =>
                                 item.TravelerId == targetTraveler.TravelerId &&
                                 item.DocumentType == "PASSPORT"))
                {
                    oldDocument.IsCurrent = false;
                }

                action = PassportSaveAction.CreatedDocumentVersion;
            }
            else
            {
                targetTraveler = new TravelerRecord
                {
                    TravelerId = Guid.NewGuid(),
                    NameEn = name,
                    BirthDate = birthDate,
                    Gender = sex,
                    Nationality = nationality,
                    PersonalIdType = "PASSPORT",
                    PersonalIdNumber = passportNumber,
                    CreatedAt = now,
                    UpdatedAt = now
                };

                _travelers.Add(targetTraveler);
                action = PassportSaveAction.CreatedTravelerAndDocument;
            }

            var documentVersion = new DocumentVersionRecord
            {
                DocumentVersionId = Guid.NewGuid(),
                TravelerId = targetTraveler.TravelerId,
                DocumentType = "PASSPORT",
                DocumentNumber = passportNumber,
                IssuingCountry = issuingState,
                Nationality = nationality,
                ExpiryDate = expiryDate,
                IsCurrent = true,
                VerifiedAt = request.ReviewedAt,
                CreatedAt = now
            };

            _documents.Add(documentVersion);

            var targetVersionCount = _documents.Count(
                item => item.TravelerId == targetTraveler.TravelerId);

            return new PassportSaveResult(
                action,
                targetTraveler.TravelerId,
                documentVersion.DocumentVersionId,
                targetVersionCount);
        }
    }

    private static void UpdateTraveler(
        TravelerRecord traveler,
        string name,
        DateOnly birthDate,
        string sex,
        string nationality,
        string passportNumber,
        DateTimeOffset now)
    {
        traveler.NameEn = name;
        traveler.BirthDate = birthDate;
        traveler.Gender = sex;
        traveler.Nationality = nationality;
        traveler.PersonalIdType = "PASSPORT";
        traveler.PersonalIdNumber = passportNumber;
        traveler.UpdatedAt = now;
    }

    private static string Normalize(string value) =>
        value.Trim().ToUpperInvariant();
}
