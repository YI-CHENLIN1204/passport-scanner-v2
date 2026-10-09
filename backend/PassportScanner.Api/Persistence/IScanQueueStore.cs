using PassportScanner.Api.Contracts;

namespace PassportScanner.Api.Persistence;

public sealed record ScanItemImage(
    byte[] Bytes,
    string ContentType,
    string FileName);

public interface IScanQueueStore
{
    ScanBatchResponse CreateBatch(
        Guid tourId,
        CreateScanBatchRequest request,
        DateTimeOffset now);

    ScanItemResponse AddItem(
        Guid batchId,
        CreateScanItemRequest request,
        DateTimeOffset now);

    ScanBatchResponse CompleteBatch(
        Guid batchId,
        CompleteScanBatchRequest request,
        DateTimeOffset now);

    IReadOnlyList<ScanBatchResponse> ListBatches(
        Guid tourId,
        int limit);

    IReadOnlyList<ReviewQueuePersonResponse> ListReviewQueue(
        Guid tourId,
        DateTimeOffset now);

    ScanItemImage? GetItemImage(
        Guid scanItemId,
        DateTimeOffset now);

    ScanItemResponse? ReviewItem(
        Guid scanItemId,
        ReviewScanItemRequest request,
        DateTimeOffset now);

    bool DeleteItem(
        Guid scanItemId,
        DateTimeOffset now);

    int PurgeExpiredImages(
        DateTimeOffset now);
}
