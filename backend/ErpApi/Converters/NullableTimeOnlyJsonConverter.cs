using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace ErpApi.Converters;

public class NullableTimeOnlyJsonConverter : JsonConverter<TimeOnly?>
{
    private static readonly string[] Formats =
    {
        "HH:mm",
        "HH:mm:ss",
        "H:mm",
        "H:mm:ss"
    };

    public override TimeOnly? Read(
        ref Utf8JsonReader reader,
        Type typeToConvert,
        JsonSerializerOptions options)
    {
        if (reader.TokenType == JsonTokenType.Null)
            return null;

        if (reader.TokenType != JsonTokenType.String)
            throw new JsonException("Time value must be a string or null.");

        var value = reader.GetString();

        if (string.IsNullOrWhiteSpace(value))
            return null;

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
        TimeOnly? value,
        JsonSerializerOptions options)
    {
        if (value.HasValue)
        {
            writer.WriteStringValue(value.Value.ToString("HH:mm:ss", CultureInfo.InvariantCulture));
        }
        else
        {
            writer.WriteNullValue();
        }
    }
}
