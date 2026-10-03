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
            .Select(item => ToSummary(item))
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

        var documents = db.DocumentVersions
            .AsNoTracking()
            .Where(item => travelerIds.Contains(item.TravelerId))
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
                            document.DocumentNumber,
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

        if (
            request.ExpectedMemberCount is < 1 or > 500)
        {
            throw new ArgumentException(
                "預計人數若有填寫，必須介於 1～500。");
        }

        var tour = new TourRecord
        {
            TourId = Guid.NewGuid(),
            TourName = name,
            DepartureDate = request.DepartureDate,
            ReturnDate = request.ReturnDate,
            ExpectedMemberCount = request.ExpectedMemberCount,
            CreatedAt = now,
            UpdatedAt = now
        };

        db.Tours.Add(tour);
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

        var builder = new StringBuilder();
        builder.AppendLine(
            "中文姓名,英文姓名,出生日期,性別,國籍,護照號碼,護照有效期限,台胞證號碼,台胞證有效期限,身分證字號");

        foreach (var member in detail.Members)
        {
            var passport = member.Documents.FirstOrDefault(
                item => item.DocumentType == "PASSPORT");
            var permit = member.Documents.FirstOrDefault(
                item => item.DocumentType == "TAIWAN_COMPATRIOT_PERMIT");
            var nationalId = member.Documents.FirstOrDefault(
                item => item.DocumentType == "TAIWAN_NATIONAL_ID");

            builder.AppendLine(string.Join(
                ",",
                Csv(member.NameZh),
                Csv(member.NameEn),
                Csv(member.BirthDate.ToString(
                    "yyyy-MM-dd",
                    CultureInfo.InvariantCulture)),
                Csv(member.Gender),
                Csv(member.Nationality),
                Csv(passport?.DocumentNumber),
                Csv(passport?.ExpiryDate?.ToString(
                    "yyyy-MM-dd",
                    CultureInfo.InvariantCulture)),
                Csv(permit?.DocumentNumber),
                Csv(permit?.ExpiryDate?.ToString(
                    "yyyy-MM-dd",
                    CultureInfo.InvariantCulture)),
                Csv(nationalId?.DocumentNumber)));
        }

        return Encoding.UTF8.GetPreamble()
            .Concat(Encoding.UTF8.GetBytes(builder.ToString()))
            .ToArray();
    }

    private TourSummaryResponse ToSummary(TourRecord tour)
    {
        var memberCount = db.TourMembers.Count(
            item => item.TourId == tour.TourId);

        var travelerIds = db.TourMembers
            .Where(item => item.TourId == tour.TourId)
            .Select(item => item.TravelerId);

        var documentCount = db.DocumentVersions.Count(
            item =>
                travelerIds.Contains(item.TravelerId) &&
                item.IsCurrent);

        return new TourSummaryResponse(
            tour.TourId,
            tour.TourName,
            tour.DepartureDate,
            tour.ReturnDate,
            tour.ExpectedMemberCount,
            memberCount,
            documentCount,
            tour.UpdatedAt);
    }
}
