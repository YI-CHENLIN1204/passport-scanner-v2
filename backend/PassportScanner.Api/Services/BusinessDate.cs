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

    public static DateTimeOffset
        ProductionPhotoDeleteAfter(
            DateOnly returnDate)
    {
        var taiwanMidnight =
            new DateTimeOffset(
                returnDate
                    .AddDays(8)
                    .ToDateTime(
                        TimeOnly.MinValue,
                        DateTimeKind.Unspecified),
                TaiwanOffset);

        return taiwanMidnight
            .ToUniversalTime();
    }
}
