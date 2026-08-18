namespace ErpApi.Models;

public class OtRoundingRule
{
    public int OtRoundingRuleId { get; set; }
    public int FromMinutes { get; set; }
    public int ToMinutes { get; set; }
    public int RoundedMinutes { get; set; }
    public bool IsActive { get; set; } = true;
}
