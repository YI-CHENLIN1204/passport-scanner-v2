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
    }
}
