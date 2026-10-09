using Microsoft.EntityFrameworkCore;
using PassportScanner.Api.Contracts;
using PassportScanner.Api.Validation;
using PassportScanner.Api.Persistence;
using PassportScanner.Api.Mapping;
using PassportScanner.Api.Services;

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
builder.Services.AddScoped<IScanQueueStore, PostgresScanQueueStore>();
builder.Services.AddScoped<IOcrBenchmarkStore, PostgresOcrBenchmarkStore>();
builder.Services.AddScoped<IOcrBenchmarkRunStore, PostgresOcrBenchmarkRunStore>();
builder.Services.AddScoped<ITrainingDatasetStore, PostgresTrainingDatasetStore>();
builder.Services.AddHostedService<PhotoRetentionHostedService>();

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
        ALTER TABLE travelers
            ADD COLUMN IF NOT EXISTS national_id_number varchar(20) NULL;

        CREATE INDEX IF NOT EXISTS ix_travelers_national_id_number
            ON travelers (national_id_number);

        CREATE TABLE IF NOT EXISTS tours (
            tour_id uuid PRIMARY KEY,
            tour_name varchar(160) NOT NULL,
            departure_date date NOT NULL,
            return_date date NOT NULL,
            required_document_types text[] NOT NULL
                DEFAULT ARRAY['PASSPORT']::text[],
            created_at timestamptz NOT NULL,
            updated_at timestamptz NOT NULL
        );

        CREATE INDEX IF NOT EXISTS ix_tours_departure_date
            ON tours (departure_date);

        ALTER TABLE tours
            DROP COLUMN IF EXISTS expected_member_count;

        ALTER TABLE tours
            ADD COLUMN IF NOT EXISTS required_document_types text[] NOT NULL
                DEFAULT ARRAY['PASSPORT']::text[];

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

        CREATE TABLE IF NOT EXISTS tour_member_documents (
            tour_member_document_id uuid PRIMARY KEY,
            tour_member_id uuid NOT NULL
                REFERENCES tour_members(tour_member_id)
                ON DELETE CASCADE,
            document_version_id uuid NOT NULL
                REFERENCES document_versions(document_version_id)
                ON DELETE CASCADE,
            document_type varchar(40) NOT NULL,
            created_at timestamptz NOT NULL,
            updated_at timestamptz NOT NULL
        );

        CREATE UNIQUE INDEX IF NOT EXISTS
            ux_tour_member_documents_member_type
            ON tour_member_documents (
                tour_member_id,
                document_type
            );

        CREATE INDEX IF NOT EXISTS
            ix_tour_member_documents_document
            ON tour_member_documents (document_version_id);

        CREATE TABLE IF NOT EXISTS scan_batches (
            scan_batch_id uuid PRIMARY KEY,
            tour_id uuid NOT NULL
                REFERENCES tours(tour_id)
                ON DELETE CASCADE,
            document_type varchar(40) NOT NULL,
            status varchar(20) NOT NULL,
            item_count integer NOT NULL,
            attempt_count integer NOT NULL DEFAULT 0,
            failed_count integer NOT NULL DEFAULT 0,
            created_at timestamptz NOT NULL,
            updated_at timestamptz NOT NULL
        );

        ALTER TABLE scan_batches
            ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0;

        ALTER TABLE scan_batches
            ADD COLUMN IF NOT EXISTS failed_count integer NOT NULL DEFAULT 0;

        UPDATE scan_batches
            SET attempt_count = item_count
            WHERE
                status = 'COMPLETED'
                AND attempt_count = 0
                AND item_count > 0;

        CREATE TABLE IF NOT EXISTS tour_person_drafts (
            draft_person_id uuid PRIMARY KEY,
            tour_id uuid NOT NULL
                REFERENCES tours(tour_id)
                ON DELETE CASCADE,
            name_zh varchar(80) NOT NULL,
            birth_date date NULL,
            gender varchar(12) NOT NULL,
            created_at timestamptz NOT NULL,
            updated_at timestamptz NOT NULL
        );

        CREATE INDEX IF NOT EXISTS ix_tour_person_drafts_identity
            ON tour_person_drafts (
                tour_id,
                name_zh,
                birth_date,
                gender
            );

        CREATE TABLE IF NOT EXISTS scan_items (
            scan_item_id uuid PRIMARY KEY,
            scan_batch_id uuid NOT NULL
                REFERENCES scan_batches(scan_batch_id)
                ON DELETE CASCADE,
            draft_person_id uuid NOT NULL
                REFERENCES tour_person_drafts(draft_person_id)
                ON DELETE CASCADE,
            document_type varchar(40) NOT NULL,
            original_file_name varchar(255) NOT NULL,
            image_content_type varchar(80) NOT NULL,
            image_bytes bytea NOT NULL,
            ocr_input_image_content_type varchar(80) NULL,
            ocr_input_image_bytes bytea NULL,
            name_zh varchar(80) NOT NULL,
            name_zh_on_document varchar(80) NOT NULL DEFAULT '',
            name_en varchar(160) NOT NULL,
            birth_date date NULL,
            gender varchar(12) NOT NULL,
            nationality varchar(12) NULL,
            national_id_number varchar(20) NULL,
            document_number varchar(80) NOT NULL,
            issuing_country varchar(12) NULL,
            expiry_date date NULL,
            ocr_payload_json text NOT NULL,
            review_status varchar(20) NOT NULL,
            saved_document_version_id uuid NULL,
            reviewed_at timestamptz NULL,
            delete_after timestamptz NOT NULL,
            created_at timestamptz NOT NULL,
            updated_at timestamptz NOT NULL
        );

        ALTER TABLE scan_items
            ADD COLUMN IF NOT EXISTS name_zh_on_document varchar(80);

        ALTER TABLE scan_items
            ADD COLUMN IF NOT EXISTS national_id_number varchar(20) NULL;

        ALTER TABLE scan_items
            ADD COLUMN IF NOT EXISTS ocr_input_image_content_type varchar(80) NULL;

        ALTER TABLE scan_items
            ADD COLUMN IF NOT EXISTS ocr_input_image_bytes bytea NULL;

        UPDATE scan_items
            SET name_zh_on_document = ''
            WHERE name_zh_on_document IS NULL;

        ALTER TABLE scan_items
            ALTER COLUMN name_zh_on_document SET NOT NULL;

        ALTER TABLE scan_items
            ADD COLUMN IF NOT EXISTS saved_document_version_id uuid NULL;

        UPDATE scan_items AS scan
        SET saved_document_version_id = (
            SELECT document.document_version_id
            FROM document_versions AS document
            WHERE
                document.document_type = scan.document_type
                AND document.document_number = scan.document_number
                AND (
                    scan.document_type <> 'PASSPORT'
                    OR COALESCE(document.issuing_country, '') =
                       COALESCE(scan.issuing_country, '')
                )
            ORDER BY
                document.is_current DESC,
                document.verified_at DESC,
                document.created_at DESC
            LIMIT 1
        )
        WHERE
            scan.review_status = 'REVIEWED'
            AND scan.saved_document_version_id IS NULL
            AND EXISTS (
                SELECT 1
                FROM document_versions AS document
                WHERE
                    document.document_type = scan.document_type
                    AND document.document_number = scan.document_number
                    AND (
                        scan.document_type <> 'PASSPORT'
                        OR COALESCE(document.issuing_country, '') =
                           COALESCE(scan.issuing_country, '')
                    )
            );

        INSERT INTO tour_member_documents (
            tour_member_document_id,
            tour_member_id,
            document_version_id,
            document_type,
            created_at,
            updated_at
        )
        SELECT
            CAST(
                md5(
                    latest.tour_member_id::text ||
                    latest.document_type
                )
                AS uuid
            ),
            latest.tour_member_id,
            latest.document_version_id,
            latest.document_type,
            latest.linked_at,
            latest.linked_at
        FROM (
            SELECT DISTINCT ON (
                member.tour_member_id,
                document.document_type
            )
                member.tour_member_id,
                document.document_version_id,
                document.document_type,
                COALESCE(
                    scan.reviewed_at,
                    scan.updated_at,
                    scan.created_at
                ) AS linked_at
            FROM scan_items AS scan
            INNER JOIN scan_batches AS batch
                ON batch.scan_batch_id =
                    scan.scan_batch_id
            INNER JOIN document_versions AS document
                ON document.document_version_id =
                    scan.saved_document_version_id
            INNER JOIN tour_members AS member
                ON member.tour_id = batch.tour_id
                AND member.traveler_id =
                    document.traveler_id
            WHERE
                scan.review_status = 'REVIEWED'
                AND scan.saved_document_version_id
                    IS NOT NULL
            ORDER BY
                member.tour_member_id,
                document.document_type,
                scan.reviewed_at DESC NULLS LAST,
                scan.updated_at DESC,
                scan.created_at DESC
        ) AS latest
        ON CONFLICT (
            tour_member_id,
            document_type
        )
        DO UPDATE SET
            document_version_id =
                EXCLUDED.document_version_id,
            updated_at =
                GREATEST(
                    tour_member_documents.updated_at,
                    EXCLUDED.updated_at
                );

        CREATE INDEX IF NOT EXISTS ix_scan_items_draft_review_status
            ON scan_items (draft_person_id, review_status);

        CREATE TABLE IF NOT EXISTS training_samples (
            training_sample_id uuid PRIMARY KEY,
            source_scan_item_id uuid NOT NULL,
            document_type varchar(40) NOT NULL,
            image_content_type varchar(80) NOT NULL,
            image_bytes bytea NOT NULL,
            ocr_input_image_content_type varchar(80) NULL,
            ocr_input_image_bytes bytea NULL,
            ocr_payload_json text NOT NULL,
            ground_truth_json text NOT NULL,
            selected_at timestamptz NOT NULL,
            updated_at timestamptz NOT NULL
        );

        ALTER TABLE training_samples
            ADD COLUMN IF NOT EXISTS ocr_input_image_content_type varchar(80) NULL;

        ALTER TABLE training_samples
            ADD COLUMN IF NOT EXISTS ocr_input_image_bytes bytea NULL;

        CREATE UNIQUE INDEX IF NOT EXISTS
            ux_training_samples_source_scan_item
            ON training_samples (source_scan_item_id);

        CREATE TABLE IF NOT EXISTS ocr_evaluation_baselines (
            training_sample_id uuid PRIMARY KEY
                REFERENCES training_samples(training_sample_id)
                ON DELETE CASCADE,
            result_json text NOT NULL,
            captured_at timestamptz NOT NULL
        );

        CREATE TABLE IF NOT EXISTS ocr_benchmark_runs (
            benchmark_run_id uuid PRIMARY KEY,
            pipeline_version varchar(80) NOT NULL,
            sample_count integer NOT NULL,
            failed_count integer NOT NULL,
            baseline_created_count integer NOT NULL,
            summary_json text NOT NULL,
            created_at timestamptz NOT NULL
        );

        CREATE INDEX IF NOT EXISTS
            ix_ocr_benchmark_runs_created_at
            ON ocr_benchmark_runs (created_at DESC);
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
    (
        string? query,
        string? status,
        string? documentType,
        DateOnly? departureFrom,
        DateOnly? departureTo,
        ITourStore store) =>
    {
        try
        {
            return Results.Ok(
                store.ListTours(
                    query,
                    status,
                    documentType,
                    departureFrom,
                    departureTo));
        }
        catch (ArgumentException ex)
        {
            return Results.BadRequest(
                new { message = ex.Message });
        }
    });

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

app.MapPut(
    "/api/tours/{tourId:guid}",
    (
        Guid tourId,
        UpdateTourRequest request,
        ITourStore store) =>
    {
        try
        {
            var updated = store.UpdateTour(
                tourId,
                request,
                DateTimeOffset.UtcNow);

            return updated is null
                ? Results.NotFound()
                : Results.Ok(updated);
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

app.MapPost(
    "/api/tours/{tourId:guid}/scan-batches",
    (
        Guid tourId,
        CreateScanBatchRequest request,
        IScanQueueStore store) =>
    {
        try
        {
            return Results.Created(
                $"/api/tours/{tourId}/scan-batches",
                store.CreateBatch(
                    tourId,
                    request,
                    DateTimeOffset.UtcNow));
        }
        catch (KeyNotFoundException ex)
        {
            return Results.NotFound(
                new { message = ex.Message });
        }
        catch (ArgumentException ex)
        {
            return Results.BadRequest(
                new { message = ex.Message });
        }
    });

app.MapGet(
    "/api/tours/{tourId:guid}/scan-batches",
    (
        Guid tourId,
        int? limit,
        IScanQueueStore store) =>
    {
        try
        {
            return Results.Ok(
                store.ListBatches(
                    tourId,
                    limit ?? 5));
        }
        catch (KeyNotFoundException ex)
        {
            return Results.NotFound(
                new { message = ex.Message });
        }
    });

app.MapPost(
    "/api/scan-batches/{batchId:guid}/items",
    (
        Guid batchId,
        CreateScanItemRequest request,
        IScanQueueStore store) =>
    {
        try
        {
            return Results.Created(
                $"/api/scan-batches/{batchId}/items",
                store.AddItem(
                    batchId,
                    request,
                    DateTimeOffset.UtcNow));
        }
        catch (KeyNotFoundException ex)
        {
            return Results.NotFound(
                new { message = ex.Message });
        }
        catch (ArgumentException ex)
        {
            return Results.BadRequest(
                new { message = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            return Results.BadRequest(
                new { message = ex.Message });
        }
    });

app.MapPost(
    "/api/scan-batches/{batchId:guid}/complete",
    (
        Guid batchId,
        CompleteScanBatchRequest request,
        IScanQueueStore store) =>
    {
        try
        {
            return Results.Ok(
                store.CompleteBatch(
                    batchId,
                    request,
                    DateTimeOffset.UtcNow));
        }
        catch (KeyNotFoundException ex)
        {
            return Results.NotFound(
                new { message = ex.Message });
        }
        catch (ArgumentException ex)
        {
            return Results.BadRequest(
                new { message = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            return Results.BadRequest(
                new { message = ex.Message });
        }
    });

app.MapGet(
    "/api/tours/{tourId:guid}/review-queue",
    (Guid tourId, IScanQueueStore store) =>
        Results.Ok(store.ListReviewQueue(tourId)));

app.MapGet(
    "/api/scan-items/{scanItemId:guid}/image",
    (Guid scanItemId, IScanQueueStore store) =>
    {
        var image = store.GetItemImage(scanItemId);

        return image is null
            ? Results.NotFound()
            : Results.File(
                image.Bytes,
                image.ContentType,
                image.FileName);
    });

app.MapPut(
    "/api/scan-items/{scanItemId:guid}/review",
    (
        Guid scanItemId,
        ReviewScanItemRequest request,
        IScanQueueStore store) =>
    {
        try
        {
            var item = store.ReviewItem(
                scanItemId,
                request,
                DateTimeOffset.UtcNow);

            return item is null
                ? Results.NotFound()
                : Results.Ok(item);
        }
        catch (ArgumentException ex)
        {
            return Results.BadRequest(
                new { message = ex.Message });
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

app.MapDelete(
    "/api/scan-items/{scanItemId:guid}",
    (
        Guid scanItemId,
        IScanQueueStore store) =>
    {
        try
        {
            return store.DeleteItem(
                scanItemId,
                DateTimeOffset.UtcNow)
                ? Results.NoContent()
                : Results.NotFound();
        }
        catch (InvalidOperationException ex)
        {
            return Results.BadRequest(
                new { message = ex.Message });
        }
    });

app.MapPut(
    "/api/scan-items/{scanItemId:guid}/training-selection",
    (
        Guid scanItemId,
        SetTrainingSampleRequest request,
        ITrainingDatasetStore store) =>
    {
        try
        {
            return Results.Ok(
                store.SetSelection(
                    scanItemId,
                    request.Selected,
                    DateTimeOffset.UtcNow));
        }
        catch (KeyNotFoundException ex)
        {
            return Results.NotFound(
                new { message = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            return Results.BadRequest(
                new { message = ex.Message });
        }
    });

app.MapGet(
    "/api/ocr-training/summary",
    (ITrainingDatasetStore store) =>
        Results.Ok(
            store.GetSummary(
                DateTimeOffset.UtcNow)));

app.MapGet(
    "/api/ocr-training/evaluation-samples",
    (
        string? split,
        ITrainingDatasetStore store) =>
    {
        try
        {
            return Results.Ok(
                store.ListEvaluationSamples(
                    string.IsNullOrWhiteSpace(split)
                        ? "test"
                        : split));
        }
        catch (ArgumentException ex)
        {
            return Results.BadRequest(
                new { message = ex.Message });
        }
    });

app.MapPut(
    "/api/ocr-training/samples/{trainingSampleId:guid}/evaluation-baseline",
    (
        Guid trainingSampleId,
        SaveEvaluationBaselineRequest request,
        ITrainingDatasetStore store) =>
    {
        try
        {
            return Results.Ok(
                store.SaveEvaluationBaseline(
                    trainingSampleId,
                    request.ResultJson,
                    DateTimeOffset.UtcNow));
        }
        catch (KeyNotFoundException ex)
        {
            return Results.NotFound(
                new { message = ex.Message });
        }
        catch (ArgumentException ex)
        {
            return Results.BadRequest(
                new { message = ex.Message });
        }
    });

app.MapGet(
    "/api/ocr-training/samples/{trainingSampleId:guid}/image",
    (
        Guid trainingSampleId,
        ITrainingDatasetStore store) =>
    {
        var image = store.GetSampleImage(
            trainingSampleId);

        return image is null
            ? Results.NotFound()
            : Results.File(
                image.Bytes,
                image.ContentType,
                image.FileName);
    });

app.MapGet(
    "/api/ocr-training/export.zip",
    (ITrainingDatasetStore store) =>
    {
        var export = store.ExportZip(
            DateTimeOffset.UtcNow);

        return Results.File(
            export.Bytes,
            export.ContentType,
            export.FileName);
    });

app.MapGet(
    "/api/ocr-benchmark/summary",
    (IOcrBenchmarkStore store) =>
        Results.Ok(
            store.GetSummary(
                DateTimeOffset.UtcNow)));

app.MapGet(
    "/api/ocr-benchmark/runs",
    (
        int? limit,
        IOcrBenchmarkRunStore store) =>
        Results.Ok(
            store.List(limit ?? 10)));

app.MapPost(
    "/api/ocr-benchmark/runs",
    (
        SaveOcrBenchmarkRunRequest request,
        IOcrBenchmarkRunStore store) =>
    {
        try
        {
            var saved = store.Save(
                request,
                DateTimeOffset.UtcNow);

            return Results.Created(
                $"/api/ocr-benchmark/runs/{saved.BenchmarkRunId}",
                saved);
        }
        catch (ArgumentException ex)
        {
            return Results.BadRequest(
                new { message = ex.Message });
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
    (
        string? query,
        string? documentType,
        string? gender,
        string? nationality,
        int? offset,
        int? limit,
        ITravelerStore store) =>
    {
        try
        {
            var travelers = store.SearchTravelers(
                query,
                documentType,
                gender,
                nationality,
                offset ?? 0,
                limit ?? 20);

            return Results.Ok(
                travelers
                    .Select(TravelerReadMapper.ToResponse)
                    .ToList());
        }
        catch (ArgumentException ex)
        {
            return Results.BadRequest(
                new { message = ex.Message });
        }
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

app.MapPut(
    "/api/travelers/{travelerId:guid}",
    (
        Guid travelerId,
        UpdateTravelerRequest request,
        ITravelerStore store) =>
    {
        try
        {
            var updated = store.UpdateTraveler(
                travelerId,
                request,
                DateTimeOffset.UtcNow);

            return updated is null
                ? Results.NotFound()
                : Results.Ok(
                    TravelerReadMapper.ToResponse(
                        updated));
        }
        catch (ArgumentException ex)
        {
            return Results.BadRequest(
                new { message = ex.Message });
        }
    });

app.MapPost(
    "/api/travelers/{targetTravelerId:guid}/merge",
    (
        Guid targetTravelerId,
        MergeTravelerRequest request,
        ITravelerStore store) =>
    {
        try
        {
            var merged = store.MergeTravelers(
                targetTravelerId,
                request.SourceTravelerId,
                DateTimeOffset.UtcNow);

            return merged is null
                ? Results.NotFound(
                    new { message = "找不到指定旅客。" })
                : Results.Ok(
                    TravelerReadMapper.ToResponse(
                        merged));
        }
        catch (ArgumentException ex)
        {
            return Results.BadRequest(
                new { message = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            return Results.BadRequest(
                new { message = ex.Message });
        }
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
                !tourStore.EnsureMemberDocument(
                    tourId.Value,
                    result.TravelerId,
                    result.DocumentVersionId,
                    "PASSPORT",
                    savedAt))
            {
                return Results.NotFound(
                    new { message = "找不到指定團別，或此團未要求這個證件類型。" });
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
                !tourStore.EnsureMemberDocument(
                    tourId.Value,
                    result.TravelerId,
                    result.DocumentVersionId,
                    "TAIWAN_NATIONAL_ID",
                    savedAt))
            {
                return Results.NotFound(
                    new { message = "找不到指定團別，或此團未要求這個證件類型。" });
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
                !tourStore.EnsureMemberDocument(
                    tourId.Value,
                    result.TravelerId,
                    result.DocumentVersionId,
                    "TAIWAN_COMPATRIOT_PERMIT",
                    savedAt))
            {
                return Results.NotFound(
                    new { message = "找不到指定團別，或此團未要求這個證件類型。" });
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
