using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace ErpApi.Converters;

public class TimeOnlyJsonConverter : JsonConverter<TimeOnly>
{
    private static readonly string[] Formats =
    {
        "HH:mm",
        "HH:mm:ss",
        "H:mm",
        "H:mm:ss"
    };

    public override TimeOnly Read(
        ref Utf8JsonReader reader,
        Type typeToConvert,
        JsonSerializerOptions options)
    {
        if (reader.TokenType != JsonTokenType.String)
            throw new JsonException("Time value must be a string.");

        var value = reader.GetString();

        if (string.IsNullOrWhiteSpace(value))
            throw new JsonException("Time value cannot be empty.");

        if (TimeOnly.TryParseExact(
                value,
                Formats,
                CultureInfo.InvariantCulture,
                DateTimeStyles.None,
                out var result))
        {
            return result;
        }

        throw new JsonException(
            $"Invalid time format '{value}'. Expected HH:mm or HH:mm:ss.");
    }

    public override void Write(
        Utf8JsonWriter writer,
        TimeOnly value,
        JsonSerializerOptions options)
    {
        writer.WriteStringValue(value.ToString("HH:mm:ss", CultureInfo.InvariantCulture));
    }
}
