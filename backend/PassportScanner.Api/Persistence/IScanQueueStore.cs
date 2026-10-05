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

    IReadOnlyList<ReviewQueuePersonResponse> ListReviewQueue(
        Guid tourId);

    ScanItemImage? GetItemImage(Guid scanItemId);

    ScanItemResponse? ReviewItem(
        Guid scanItemId,
        ReviewScanItemRequest request,
        DateTimeOffset now);

    bool DeletePendingItem(
        Guid scanItemId,
        DateTimeOffset now);
}
