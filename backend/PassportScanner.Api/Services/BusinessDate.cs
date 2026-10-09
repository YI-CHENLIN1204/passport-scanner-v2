namespace PassportScanner.Api.Services;

public static class BusinessDate
{
    private static readonly TimeSpan TaiwanOffset =
        TimeSpan.FromHours(8);

    public static DateOnly Taiwan(
        DateTimeOffset instant) =>
        DateOnly.FromDateTime(
            instant
                .ToOffset(TaiwanOffset)
                .DateTime);
}
