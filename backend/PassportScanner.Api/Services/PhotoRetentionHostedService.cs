using PassportScanner.Api.Persistence;

namespace PassportScanner.Api.Services;

public sealed class PhotoRetentionHostedService(
    IServiceScopeFactory scopeFactory,
    ILogger<PhotoRetentionHostedService> logger)
    : BackgroundService
{
    private static readonly TimeSpan Interval =
        TimeSpan.FromHours(1);

    protected override async Task ExecuteAsync(
        CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope =
                    scopeFactory.CreateScope();

                var store =
                    scope.ServiceProvider
                        .GetRequiredService<IScanQueueStore>();

                var purged =
                    store.PurgeExpiredImages(
                        DateTimeOffset.UtcNow);

                if (purged > 0)
                {
                    logger.LogInformation(
                        "Purged production images for {Count} expired scan items.",
                        purged);
                }
            }
            catch (Exception ex)
            {
                logger.LogError(
                    ex,
                    "Production image retention cleanup failed.");
            }

            try
            {
                await Task.Delay(
                    Interval,
                    stoppingToken);
            }
            catch (OperationCanceledException)
                when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
        }
    }
}
