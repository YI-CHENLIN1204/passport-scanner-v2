using Microsoft.EntityFrameworkCore;
using PassportScanner.Api.Domain;

namespace PassportScanner.Api.Persistence;

public sealed class PassportScannerDbContext(
    DbContextOptions<PassportScannerDbContext> options)
    : DbContext(options)
{
    public DbSet<TravelerRecord> Travelers => Set<TravelerRecord>();
    public DbSet<DocumentVersionRecord> DocumentVersions =>
        Set<DocumentVersionRecord>();
    public DbSet<TourRecord> Tours => Set<TourRecord>();
    public DbSet<TourMemberRecord> TourMembers => Set<TourMemberRecord>();
    public DbSet<ScanBatchRecord> ScanBatches => Set<ScanBatchRecord>();
    public DbSet<TourPersonDraftRecord> TourPersonDrafts =>
        Set<TourPersonDraftRecord>();
    public DbSet<ScanItemRecord> ScanItems => Set<ScanItemRecord>();
    public DbSet<TrainingSampleRecord> TrainingSamples =>
        Set<TrainingSampleRecord>();
    public DbSet<OcrEvaluationBaselineRecord>
        OcrEvaluationBaselines =>
            Set<OcrEvaluationBaselineRecord>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        var traveler = modelBuilder.Entity<TravelerRecord>();

        traveler.ToTable("travelers");
        traveler.HasKey(item => item.TravelerId);

        traveler.Property(item => item.TravelerId)
            .HasColumnName("traveler_id");

        traveler.Property(item => item.NameZh)
            .HasColumnName("name_zh")
            .HasMaxLength(80)
            .IsRequired();

        traveler.Property(item => item.NameEn)
            .HasColumnName("name_en")
            .HasMaxLength(160)
            .IsRequired();

        traveler.Property(item => item.BirthDate)
            .HasColumnName("birth_date")
            .IsRequired();

        traveler.Property(item => item.Gender)
            .HasColumnName("gender")
            .HasMaxLength(12)
            .IsRequired();

        traveler.Property(item => item.Nationality)
            .HasColumnName("nationality")
            .HasMaxLength(12);

        traveler.Property(item => item.NationalIdNumber)
            .HasColumnName("national_id_number")
            .HasMaxLength(20);

        traveler.Property(item => item.PersonalIdType)
            .HasColumnName("personal_id_type")
            .HasMaxLength(40)
            .IsRequired();

        traveler.Property(item => item.PersonalIdNumber)
            .HasColumnName("personal_id_number")
            .HasMaxLength(80)
            .IsRequired();

        traveler.Property(item => item.CreatedAt)
            .HasColumnName("created_at")
            .IsRequired();

        traveler.Property(item => item.UpdatedAt)
            .HasColumnName("updated_at")
            .IsRequired();

        traveler.HasIndex(item => item.NameZh)
            .HasDatabaseName("ix_travelers_name_zh");

        traveler.HasIndex(item => item.NameEn)
            .HasDatabaseName("ix_travelers_name_en");

        traveler.HasIndex(item => item.BirthDate)
            .HasDatabaseName("ix_travelers_birth_date");

        traveler.HasIndex(item => item.PersonalIdNumber)
            .HasDatabaseName("ix_travelers_personal_id_number");

        var document = modelBuilder.Entity<DocumentVersionRecord>();

        document.ToTable("document_versions");
        document.HasKey(item => item.DocumentVersionId);

        document.Property(item => item.DocumentVersionId)
            .HasColumnName("document_version_id");

        document.Property(item => item.TravelerId)
            .HasColumnName("traveler_id")
            .IsRequired();

        document.Property(item => item.DocumentType)
            .HasColumnName("document_type")
            .HasMaxLength(40)
            .IsRequired();

        document.Property(item => item.NameZhOnDocument)
            .HasColumnName("name_zh_on_document")
            .HasMaxLength(80)
            .IsRequired();

        document.Property(item => item.NameEnOnDocument)
            .HasColumnName("name_en_on_document")
            .HasMaxLength(160)
            .IsRequired();

        document.Property(item => item.DocumentNumber)
            .HasColumnName("document_number")
            .HasMaxLength(80)
            .IsRequired();

        document.Property(item => item.IssuingCountry)
            .HasColumnName("issuing_country")
            .HasMaxLength(12);

        document.Property(item => item.Nationality)
            .HasColumnName("nationality")
            .HasMaxLength(12);

        document.Property(item => item.ExpiryDate)
            .HasColumnName("expiry_date");

        document.Property(item => item.IsCurrent)
            .HasColumnName("is_current")
            .IsRequired();

        document.Property(item => item.VerifiedAt)
            .HasColumnName("verified_at")
            .IsRequired();

        document.Property(item => item.CreatedAt)
            .HasColumnName("created_at")
            .IsRequired();

        document.HasIndex(item => new
            {
                item.DocumentType,
                item.DocumentNumber
            })
            .HasDatabaseName("ix_document_versions_type_number");

        document.HasIndex(item => new
            {
                item.TravelerId,
                item.DocumentType,
                item.IsCurrent
            })
            .HasDatabaseName("ix_document_versions_traveler_current");

        document.HasOne<TravelerRecord>()
            .WithMany()
            .HasForeignKey(item => item.TravelerId)
            .OnDelete(DeleteBehavior.Cascade);

        var tour = modelBuilder.Entity<TourRecord>();

        tour.ToTable("tours");
        tour.HasKey(item => item.TourId);

        tour.Property(item => item.TourId)
            .HasColumnName("tour_id");

        tour.Property(item => item.TourName)
            .HasColumnName("tour_name")
            .HasMaxLength(160)
            .IsRequired();

        tour.Property(item => item.DepartureDate)
            .HasColumnName("departure_date")
            .IsRequired();

        tour.Property(item => item.ReturnDate)
            .HasColumnName("return_date")
            .IsRequired();

        tour.Property(item => item.RequiredDocumentTypes)
            .HasColumnName("required_document_types")
            .HasColumnType("text[]")
            .IsRequired();

        tour.Property(item => item.CreatedAt)
            .HasColumnName("created_at")
            .IsRequired();

        tour.Property(item => item.UpdatedAt)
            .HasColumnName("updated_at")
            .IsRequired();

        tour.HasIndex(item => item.DepartureDate)
            .HasDatabaseName("ix_tours_departure_date");

        var member = modelBuilder.Entity<TourMemberRecord>();

        member.ToTable("tour_members");
        member.HasKey(item => item.TourMemberId);

        member.Property(item => item.TourMemberId)
            .HasColumnName("tour_member_id");

        member.Property(item => item.TourId)
            .HasColumnName("tour_id")
            .IsRequired();

        member.Property(item => item.TravelerId)
            .HasColumnName("traveler_id")
            .IsRequired();

        member.Property(item => item.CreatedAt)
            .HasColumnName("created_at")
            .IsRequired();

        member.HasIndex(item => new
            {
                item.TourId,
                item.TravelerId
            })
            .IsUnique()
            .HasDatabaseName("ux_tour_members_tour_traveler");

        member.HasOne<TourRecord>()
            .WithMany()
            .HasForeignKey(item => item.TourId)
            .OnDelete(DeleteBehavior.Cascade);

        member.HasOne<TravelerRecord>()
            .WithMany()
            .HasForeignKey(item => item.TravelerId)
            .OnDelete(DeleteBehavior.Cascade);

        var scanBatch = modelBuilder.Entity<ScanBatchRecord>();

        scanBatch.ToTable("scan_batches");
        scanBatch.HasKey(item => item.ScanBatchId);

        scanBatch.Property(item => item.ScanBatchId)
            .HasColumnName("scan_batch_id");

        scanBatch.Property(item => item.TourId)
            .HasColumnName("tour_id")
            .IsRequired();

        scanBatch.Property(item => item.DocumentType)
            .HasColumnName("document_type")
            .HasMaxLength(40)
            .IsRequired();

        scanBatch.Property(item => item.Status)
            .HasColumnName("status")
            .HasMaxLength(20)
            .IsRequired();

        scanBatch.Property(item => item.ItemCount)
            .HasColumnName("item_count")
            .IsRequired();

        scanBatch.Property(item => item.CreatedAt)
            .HasColumnName("created_at")
            .IsRequired();

        scanBatch.Property(item => item.UpdatedAt)
            .HasColumnName("updated_at")
            .IsRequired();

        scanBatch.HasOne<TourRecord>()
            .WithMany()
            .HasForeignKey(item => item.TourId)
            .OnDelete(DeleteBehavior.Cascade);

        var draftPerson =
            modelBuilder.Entity<TourPersonDraftRecord>();

        draftPerson.ToTable("tour_person_drafts");
        draftPerson.HasKey(item => item.DraftPersonId);

        draftPerson.Property(item => item.DraftPersonId)
            .HasColumnName("draft_person_id");

        draftPerson.Property(item => item.TourId)
            .HasColumnName("tour_id")
            .IsRequired();

        draftPerson.Property(item => item.NameZh)
            .HasColumnName("name_zh")
            .HasMaxLength(80)
            .IsRequired();

        draftPerson.Property(item => item.BirthDate)
            .HasColumnName("birth_date");

        draftPerson.Property(item => item.Gender)
            .HasColumnName("gender")
            .HasMaxLength(12)
            .IsRequired();

        draftPerson.Property(item => item.CreatedAt)
            .HasColumnName("created_at")
            .IsRequired();

        draftPerson.Property(item => item.UpdatedAt)
            .HasColumnName("updated_at")
            .IsRequired();

        draftPerson.HasIndex(item => new
            {
                item.TourId,
                item.NameZh,
                item.BirthDate,
                item.Gender
            })
            .HasDatabaseName(
                "ix_tour_person_drafts_identity");

        draftPerson.HasOne<TourRecord>()
            .WithMany()
            .HasForeignKey(item => item.TourId)
            .OnDelete(DeleteBehavior.Cascade);

        var scanItem = modelBuilder.Entity<ScanItemRecord>();

        scanItem.ToTable("scan_items");
        scanItem.HasKey(item => item.ScanItemId);

        scanItem.Property(item => item.ScanItemId)
            .HasColumnName("scan_item_id");

        scanItem.Property(item => item.ScanBatchId)
            .HasColumnName("scan_batch_id")
            .IsRequired();

        scanItem.Property(item => item.DraftPersonId)
            .HasColumnName("draft_person_id")
            .IsRequired();

        scanItem.Property(item => item.DocumentType)
            .HasColumnName("document_type")
            .HasMaxLength(40)
            .IsRequired();

        scanItem.Property(item => item.OriginalFileName)
            .HasColumnName("original_file_name")
            .HasMaxLength(255)
            .IsRequired();

        scanItem.Property(item => item.ImageContentType)
            .HasColumnName("image_content_type")
            .HasMaxLength(80)
            .IsRequired();

        scanItem.Property(item => item.ImageBytes)
            .HasColumnName("image_bytes")
            .HasColumnType("bytea")
            .IsRequired();

        scanItem.Property(item =>
                item.OcrInputImageContentType)
            .HasColumnName("ocr_input_image_content_type")
            .HasMaxLength(80);

        scanItem.Property(item =>
                item.OcrInputImageBytes)
            .HasColumnName("ocr_input_image_bytes")
            .HasColumnType("bytea");

        scanItem.Property(item => item.NameZh)
            .HasColumnName("name_zh")
            .HasMaxLength(80)
            .IsRequired();

        scanItem.Property(item => item.NameZhOnDocument)
            .HasColumnName("name_zh_on_document")
            .HasMaxLength(80)
            .IsRequired();

        scanItem.Property(item => item.NameEn)
            .HasColumnName("name_en")
            .HasMaxLength(160)
            .IsRequired();

        scanItem.Property(item => item.BirthDate)
            .HasColumnName("birth_date");

        scanItem.Property(item => item.Gender)
            .HasColumnName("gender")
            .HasMaxLength(12)
            .IsRequired();

        scanItem.Property(item => item.Nationality)
            .HasColumnName("nationality")
            .HasMaxLength(12);

        scanItem.Property(item => item.NationalIdNumber)
            .HasColumnName("national_id_number")
            .HasMaxLength(20);

        scanItem.Property(item => item.DocumentNumber)
            .HasColumnName("document_number")
            .HasMaxLength(80)
            .IsRequired();

        scanItem.Property(item => item.IssuingCountry)
            .HasColumnName("issuing_country")
            .HasMaxLength(12);

        scanItem.Property(item => item.ExpiryDate)
            .HasColumnName("expiry_date");

        scanItem.Property(item => item.OcrPayloadJson)
            .HasColumnName("ocr_payload_json")
            .HasColumnType("text")
            .IsRequired();

        scanItem.Property(item => item.ReviewStatus)
            .HasColumnName("review_status")
            .HasMaxLength(20)
            .IsRequired();

        scanItem.Property(item => item.SavedDocumentVersionId)
            .HasColumnName("saved_document_version_id");

        scanItem.Property(item => item.ReviewedAt)
            .HasColumnName("reviewed_at");

        scanItem.Property(item => item.DeleteAfter)
            .HasColumnName("delete_after")
            .IsRequired();

        scanItem.Property(item => item.CreatedAt)
            .HasColumnName("created_at")
            .IsRequired();

        scanItem.Property(item => item.UpdatedAt)
            .HasColumnName("updated_at")
            .IsRequired();

        scanItem.HasIndex(item => new
            {
                item.DraftPersonId,
                item.ReviewStatus
            })
            .HasDatabaseName(
                "ix_scan_items_draft_review_status");

        scanItem.HasOne<ScanBatchRecord>()
            .WithMany()
            .HasForeignKey(item => item.ScanBatchId)
            .OnDelete(DeleteBehavior.Cascade);

        scanItem.HasOne<TourPersonDraftRecord>()
            .WithMany()
            .HasForeignKey(item => item.DraftPersonId)
            .OnDelete(DeleteBehavior.Cascade);

        var trainingSample =
            modelBuilder.Entity<TrainingSampleRecord>();

        trainingSample.ToTable("training_samples");
        trainingSample.HasKey(item =>
            item.TrainingSampleId);

        trainingSample.Property(item =>
                item.TrainingSampleId)
            .HasColumnName("training_sample_id");

        trainingSample.Property(item =>
                item.SourceScanItemId)
            .HasColumnName("source_scan_item_id")
            .IsRequired();

        trainingSample.Property(item =>
                item.DocumentType)
            .HasColumnName("document_type")
            .HasMaxLength(40)
            .IsRequired();

        trainingSample.Property(item =>
                item.ImageContentType)
            .HasColumnName("image_content_type")
            .HasMaxLength(80)
            .IsRequired();

        trainingSample.Property(item =>
                item.ImageBytes)
            .HasColumnName("image_bytes")
            .HasColumnType("bytea")
            .IsRequired();

        trainingSample.Property(item =>
                item.OcrInputImageContentType)
            .HasColumnName("ocr_input_image_content_type")
            .HasMaxLength(80);

        trainingSample.Property(item =>
                item.OcrInputImageBytes)
            .HasColumnName("ocr_input_image_bytes")
            .HasColumnType("bytea");

        trainingSample.Property(item =>
                item.OcrPayloadJson)
            .HasColumnName("ocr_payload_json")
            .HasColumnType("text")
            .IsRequired();

        trainingSample.Property(item =>
                item.GroundTruthJson)
            .HasColumnName("ground_truth_json")
            .HasColumnType("text")
            .IsRequired();

        trainingSample.Property(item =>
                item.SelectedAt)
            .HasColumnName("selected_at")
            .IsRequired();

        trainingSample.Property(item =>
                item.UpdatedAt)
            .HasColumnName("updated_at")
            .IsRequired();

        trainingSample.HasIndex(item =>
                item.SourceScanItemId)
            .IsUnique()
            .HasDatabaseName(
                "ux_training_samples_source_scan_item");

        var evaluationBaseline =
            modelBuilder.Entity<OcrEvaluationBaselineRecord>();

        evaluationBaseline.ToTable(
            "ocr_evaluation_baselines");
        evaluationBaseline.HasKey(item =>
            item.TrainingSampleId);

        evaluationBaseline.Property(item =>
                item.TrainingSampleId)
            .HasColumnName("training_sample_id");

        evaluationBaseline.Property(item =>
                item.ResultJson)
            .HasColumnName("result_json")
            .HasColumnType("text")
            .IsRequired();

        evaluationBaseline.Property(item =>
                item.CapturedAt)
            .HasColumnName("captured_at")
            .IsRequired();

        evaluationBaseline.HasOne<TrainingSampleRecord>()
            .WithOne()
            .HasForeignKey<OcrEvaluationBaselineRecord>(
                item => item.TrainingSampleId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
