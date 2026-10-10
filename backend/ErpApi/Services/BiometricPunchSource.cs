using System.Data;
using System.Text.RegularExpressions;
using ErpApi.Data;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace ErpApi.Services;

public class BiometricOptions
{
    public string Source { get; set; } = "Local";            // Local | SqlServer
    public int DuplicateWindowSeconds { get; set; } = 60;    // captures closer together than this count as one
    public SqlServerOptions SqlServer { get; set; } = new();
}

public class SqlServerOptions
{
    public string ConnectionString { get; set; } = string.Empty;
    public string Table { get; set; } = "dbo.Attendance_MachineData";
}

// Where the raw machine captures come from. Everything after this (duplicate filtering,
// pairing into In/Out) is the same whichever source is configured.
public interface IBiometricPunchSource
{
    string Name { get; }
    // All capture times for this machine-side employee number on this date, any order.
    Task<List<DateTime>> GetCaptureTimesAsync(string deviceEmpId, DateOnly date);
}

// Reads biometric_punches in this app's own database.
public class LocalBiometricPunchSource : IBiometricPunchSource
{
    private readonly AppDbContext _db;
    public LocalBiometricPunchSource(AppDbContext db) => _db = db;
    public string Name => "Local";

    public Task<List<DateTime>> GetCaptureTimesAsync(string deviceEmpId, DateOnly date) =>
        _db.BiometricPunches
            .Where(p => p.DeviceEmpId == deviceEmpId && p.AttendanceDate == date && p.RecStatus == "A")
            .OrderBy(p => p.CapturedAt)
            .Select(p => p.CapturedAt)
            .ToListAsync();
}

// Reads the biometric machine's own SQL Server table directly (read-only), e.g.
//   FAS_TIMESHEET.dbo.Attendance_MachineData(OID, DeviceOID, DeviceEmpID, AttendanceDate, DeviceCapuredTime, CreatedDate, Recstatus)
// The column names below are spelled exactly as in that table (including "Capured").
public class SqlServerBiometricPunchSource : IBiometricPunchSource
{
    private readonly BiometricOptions _opts;
    public SqlServerBiometricPunchSource(IOptions<BiometricOptions> opts) => _opts = opts.Value;
    public string Name => "SqlServer";

    private static readonly Regex SafeTableName = new(@"^[A-Za-z0-9_]+(\.[A-Za-z0-9_]+){0,2}$", RegexOptions.Compiled);

    public async Task<List<DateTime>> GetCaptureTimesAsync(string deviceEmpId, DateOnly date)
    {
        if (string.IsNullOrWhiteSpace(_opts.SqlServer.ConnectionString))
            throw new InvalidOperationException("Biometric:SqlServer:ConnectionString is not set in appsettings.json.");
        // The table name can't be a parameter, so it is checked against a strict pattern instead.
        if (!SafeTableName.IsMatch(_opts.SqlServer.Table))
            throw new InvalidOperationException("Biometric:SqlServer:Table must look like dbo.Attendance_MachineData.");

        var sql = $"SELECT [DeviceCapuredTime] FROM {_opts.SqlServer.Table} " +
                  "WHERE [DeviceEmpID] = @emp AND [AttendanceDate] >= @from AND [AttendanceDate] < @to AND [Recstatus] = 'A' " +
                  "ORDER BY [DeviceCapuredTime]";

        var result = new List<DateTime>();
        await using var conn = new SqlConnection(_opts.SqlServer.ConnectionString);
        await conn.OpenAsync();
        await using var cmd = new SqlCommand(sql, conn);
        // The machine's employee number is a number in your table; pass it as one so the index is used.
        if (long.TryParse(deviceEmpId, out var numeric)) cmd.Parameters.Add("@emp", SqlDbType.BigInt).Value = numeric;
        else cmd.Parameters.Add("@emp", SqlDbType.NVarChar, 50).Value = deviceEmpId;
        cmd.Parameters.Add("@from", SqlDbType.DateTime).Value = date.ToDateTime(TimeOnly.MinValue);
        cmd.Parameters.Add("@to", SqlDbType.DateTime).Value = date.AddDays(1).ToDateTime(TimeOnly.MinValue);
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync()) result.Add(reader.GetDateTime(0));
        return result;
    }
}
