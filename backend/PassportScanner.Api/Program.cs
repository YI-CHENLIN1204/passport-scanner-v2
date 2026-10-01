using PassportScanner.Api.Contracts;
using PassportScanner.Api.Validation;
using PassportScanner.Api.Persistence;
using PassportScanner.Api.Mapping;

var builder = WebApplication.CreateBuilder(args);

const string frontendPolicy = "Frontend";

var frontendOrigin =
    builder.Configuration["FrontendOrigin"]
    ?? "http://localhost:5173";

builder.Services.AddSingleton<ITravelerStore, InMemoryTravelerStore>();

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

app.UseCors(frontendPolicy);

app.MapGet("/", () => Results.Redirect("/api/health"));

app.MapGet("/api/health", () =>
    Results.Ok(new
    {
        status = "ok",
        service = "passport-scanner-api",
        timestamp = DateTimeOffset.UtcNow
    }));

app.MapPost(
    "/api/passport-reviews",
    (PassportReviewRequest request, ITravelerStore store) =>
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

            return Results.Ok(
                new PassportReviewSaveResponse(
                    Accepted: true,
                    Persistence: "volatile-in-memory",
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
                Persistence: "volatile-in-memory",
                TravelerCount: store.TravelerCount,
                DocumentVersionCount: store.DocumentVersionCount,
                CheckedAt: DateTimeOffset.UtcNow)));

app.MapPost(
    "/api/taiwan-compatriot-permit-reviews",
    (TaiwanCompatriotPermitReviewRequest request, ITravelerStore store) =>
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

            return Results.Ok(
                new TaiwanCompatriotPermitReviewSaveResponse(
                    Accepted: true,
                    Persistence: "volatile-in-memory",
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
