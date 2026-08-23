using ErpApi.Models;
namespace ErpApi.Services;

public interface IJwtService
{
    string GenerateToken(Employee employee);
}
