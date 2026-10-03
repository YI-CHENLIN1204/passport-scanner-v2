using Microsoft.EntityFrameworkCore;
using PassportScanner.Api.Contracts;
using PassportScanner.Api.Validation;
using PassportScanner.Api.Persistence;
using PassportScanner.Api.Mapping;

var builder = WebApplication.CreateBuilder(args);

const string frontendPolicy = "Frontend";

var frontendOrigin =
    builder.Configuration["FrontendOrigin"]
    ?? "http://localhost:5173";

var databaseConnection =
    builder.Configuration.GetConnectionString("PassportScanner")
    ?? throw new InvalidOperationException(
        "ConnectionStrings:PassportScanner is required.");

builder.Services.AddDbContext<PassportScannerDbContext>(options =>
    options.UseNpgsql(databaseConnection));

builder.Services.AddScoped<ITravelerStore, PostgresTravelerStore>();
builder.Services.AddScoped<ITourStore, PostgresTourStore>();

builder.Services.AddCors(options =>
{
    options.AddPolicy(frontendPolicy, policy =>
    {
        policy
            .WithOrigins(frontendOrigin)
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
});

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider
        .GetRequiredService<PassportScannerDbContext>();

    db.Database.EnsureCreated();

    db.Database.ExecuteSqlRaw(
        """
        CREATE TABLE IF NOT EXISTS tours (
            tour_id uuid PRIMARY KEY,
            tour_name varchar(160) NOT NULL,
            departure_date date NOT NULL,
            return_date date NOT NULL,
            created_at timestamptz NOT NULL,
            updated_at timestamptz NOT NULL
        );

        CREATE INDEX IF NOT EXISTS ix_tours_departure_date
            ON tours (departure_date);

        ALTER TABLE tours
            DROP COLUMN IF EXISTS expected_member_count;

        CREATE TABLE IF NOT EXISTS tour_members (
            tour_member_id uuid PRIMARY KEY,
            tour_id uuid NOT NULL
                REFERENCES tours(tour_id)
                ON DELETE CASCADE,
            traveler_id uuid NOT NULL
                REFERENCES travelers(traveler_id)
                ON DELETE CASCADE,
            created_at timestamptz NOT NULL
        );

        CREATE UNIQUE INDEX IF NOT EXISTS ux_tour_members_tour_traveler
            ON tour_members (tour_id, traveler_id);
        """);
}

app.UseCors(frontendPolicy);

app.MapGet("/", () => Results.Redirect("/api/health"));

app.MapGet("/api/health", () =>
    Results.Ok(new
    {
        status = "ok",
        service = "passport-scanner-api",
        timestamp = DateTimeOffset.UtcNow
    }));

app.MapGet(
    "/api/tours",
    (string? query, ITourStore store) =>
        Results.Ok(store.ListTours(query)));

app.MapGet(
    "/api/tours/{tourId:guid}",
    (Guid tourId, ITourStore store) =>
    {
        var tour = store.GetTour(tourId);
        return tour is null
            ? Results.NotFound()
            : Results.Ok(tour);
    });

app.MapPost(
    "/api/tours",
    (CreateTourRequest request, ITourStore store) =>
    {
        try
        {
            return Results.Created(
                "/api/tours",
                store.CreateTour(
                    request,
                    DateTimeOffset.UtcNow));
        }
        catch (ArgumentException ex)
        {
            return Results.BadRequest(
                new { message = ex.Message });
        }
    });

app.MapGet(
    "/api/tours/{tourId:guid}/export.csv",
    (Guid tourId, ITourStore store) =>
    {
        try
        {
            var bytes = store.ExportCsv(tourId);
            return Results.File(
                bytes,
                "text/csv; charset=utf-8",
                $"tour-{tourId:N}.csv");
        }
        catch (KeyNotFoundException)
        {
            return Results.NotFound();
        }
    });

app.MapGet(
    "/api/document-store/status",
    (ITravelerStore store) =>
        Results.Ok(
            new DocumentStoreStatusResponse(
                Persistence: "postgresql",
                TravelerCount: store.TravelerCount,
                DocumentVersionCount: store.DocumentVersionCount,
                CheckedAt: DateTimeOffset.UtcNow)));

app.MapGet(
    "/api/travelers",
    (string? query, int? limit, ITravelerStore store) =>
    {
        var travelers = store.SearchTravelers(
            query,
            limit ?? 20);

        return Results.Ok(
            travelers
                .Select(TravelerReadMapper.ToResponse)
                .ToList());
    });

app.MapGet(
    "/api/travelers/{travelerId:guid}",
    (Guid travelerId, ITravelerStore store) =>
    {
        var traveler = store.GetTraveler(travelerId);

        return traveler is null
            ? Results.NotFound()
            : Results.Ok(
                TravelerReadMapper.ToResponse(traveler));
    });

app.MapPost(
    "/api/passport-reviews",
    (
        PassportReviewRequest request,
        Guid? tourId,
        ITravelerStore store,
        ITourStore tourStore) =>
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var errors = PassportReviewValidator.Validate(request, today);

        if (errors.Count > 0)
        {
            return Results.ValidationProblem(
                errors,
                title: "Passport review validation failed.");
        }

        var warnings = PassportReviewValidator.GetWarnings(request, today);

        try
        {
            var savedAt = DateTimeOffset.UtcNow;
            var result = store.SaveDocumentReview(
                PassportReviewMapper.ToDocumentInput(request),
                savedAt);

            if (
                tourId.HasValue &&
                !tourStore.EnsureMember(
                    tourId.Value,
                    result.TravelerId,
                    savedAt))
            {
                return Results.NotFound(
                    new { message = "找不到指定團別。" });
            }

            return Results.Ok(
                new PassportReviewSaveResponse(
                    Accepted: true,
                    Persistence: "postgresql",
                    Action: result.Action.ToString(),
                    TravelerId: result.TravelerId,
                    DocumentVersionId: result.DocumentVersionId,
                    TravelerDocumentVersionCount:
                        result.TravelerDocumentVersionCount,
                    SavedAt: savedAt,
                    Warnings: warnings));
        }
        catch (AmbiguousTravelerMatchException ex)
        {
            return Results.Conflict(
                new
                {
                    code = "ambiguousTravelerMatch",
                    message = ex.Message
                });
        }
    });

app.MapGet(
    "/api/passport-reviews/store-status",
    (ITravelerStore store) =>
        Results.Ok(
            new PassportStoreStatusResponse(
                Persistence: "postgresql",
                TravelerCount: store.TravelerCount,
                DocumentVersionCount: store.DocumentVersionCount,
                CheckedAt: DateTimeOffset.UtcNow)));

app.MapPost(
    "/api/taiwan-national-id-reviews",
    (
        TaiwanNationalIdReviewRequest request,
        Guid? tourId,
        ITravelerStore store,
        ITourStore tourStore) =>
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var errors = TaiwanNationalIdReviewValidator.Validate(
            request,
            today);

        if (errors.Count > 0)
        {
            return Results.ValidationProblem(
                errors,
                title: "Taiwan national ID review validation failed.");
        }

        var warnings =
            TaiwanNationalIdReviewValidator.GetWarnings(request);

        try
        {
            var savedAt = DateTimeOffset.UtcNow;
            var result = store.SaveDocumentReview(
                TaiwanNationalIdReviewMapper.ToDocumentInput(request),
                savedAt);

            if (
                tourId.HasValue &&
                !tourStore.EnsureMember(
                    tourId.Value,
                    result.TravelerId,
                    savedAt))
            {
                return Results.NotFound(
                    new { message = "找不到指定團別。" });
            }

            return Results.Ok(
                new TaiwanNationalIdReviewSaveResponse(
                    Accepted: true,
                    Persistence: "postgresql",
                    Action: result.Action.ToString(),
                    TravelerId: result.TravelerId,
                    DocumentVersionId: result.DocumentVersionId,
                    TravelerDocumentVersionCount:
                        result.TravelerDocumentVersionCount,
                    SavedAt: savedAt,
                    Warnings: warnings));
        }
        catch (AmbiguousTravelerMatchException ex)
        {
            return Results.Conflict(
                new
                {
                    code = "ambiguousTravelerMatch",
                    message = ex.Message
                });
        }
    });

app.MapPost(
    "/api/taiwan-national-id-reviews/validate",
    (TaiwanNationalIdReviewRequest request) =>
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var errors = TaiwanNationalIdReviewValidator.Validate(
            request,
            today);

        if (errors.Count > 0)
        {
            return Results.ValidationProblem(
                errors,
                title: "Taiwan national ID review validation failed.");
        }

        return Results.Ok(
            new PassportReviewValidationResponse(
                Accepted: true,
                Persistence: "validated-only",
                ReceivedAt: DateTimeOffset.UtcNow,
                Warnings:
                    TaiwanNationalIdReviewValidator.GetWarnings(request)));
    });

app.MapPost(
    "/api/taiwan-compatriot-permit-reviews",
    (
        TaiwanCompatriotPermitReviewRequest request,
        Guid? tourId,
        ITravelerStore store,
        ITourStore tourStore) =>
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var errors = TaiwanCompatriotPermitReviewValidator.Validate(
            request,
            today);

        if (errors.Count > 0)
        {
            return Results.ValidationProblem(
                errors,
                title: "Taiwan compatriot permit review validation failed.");
        }

        var warnings =
            TaiwanCompatriotPermitReviewValidator.GetWarnings(
                request,
                today);

        try
        {
            var savedAt = DateTimeOffset.UtcNow;
            var result = store.SaveDocumentReview(
                TaiwanCompatriotPermitReviewMapper.ToDocumentInput(request),
                savedAt);

            if (
                tourId.HasValue &&
                !tourStore.EnsureMember(
                    tourId.Value,
                    result.TravelerId,
                    savedAt))
            {
                return Results.NotFound(
                    new { message = "找不到指定團別。" });
            }

            return Results.Ok(
                new TaiwanCompatriotPermitReviewSaveResponse(
                    Accepted: true,
                    Persistence: "postgresql",
                    Action: result.Action.ToString(),
                    TravelerId: result.TravelerId,
                    DocumentVersionId: result.DocumentVersionId,
                    TravelerDocumentVersionCount:
                        result.TravelerDocumentVersionCount,
                    SavedAt: savedAt,
                    Warnings: warnings));
        }
        catch (AmbiguousTravelerMatchException ex)
        {
            return Results.Conflict(
                new
                {
                    code = "ambiguousTravelerMatch",
                    message = ex.Message
                });
        }
    });

app.MapPost(
    "/api/taiwan-compatriot-permit-reviews/validate",
    (TaiwanCompatriotPermitReviewRequest request) =>
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var errors = TaiwanCompatriotPermitReviewValidator.Validate(
            request,
            today);

        if (errors.Count > 0)
        {
            return Results.ValidationProblem(
                errors,
                title: "Taiwan compatriot permit review validation failed.");
        }

        var warnings =
            TaiwanCompatriotPermitReviewValidator.GetWarnings(
                request,
                today);

        return Results.Ok(
            new PassportReviewValidationResponse(
                Accepted: true,
                Persistence: "validated-only",
                ReceivedAt: DateTimeOffset.UtcNow,
                Warnings: warnings));
    });

app.MapPost(
    "/api/passport-reviews/validate",
    (PassportReviewRequest request) =>
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var errors = PassportReviewValidator.Validate(request, today);

        if (errors.Count > 0)
        {
            return Results.ValidationProblem(
                errors,
                title: "Passport review validation failed.");
        }

        var warnings = PassportReviewValidator.GetWarnings(request, today);

        return Results.Ok(
            new PassportReviewValidationResponse(
                Accepted: true,
                Persistence: "validated-only",
                ReceivedAt: DateTimeOffset.UtcNow,
                Warnings: warnings));
    });

app.Run();
