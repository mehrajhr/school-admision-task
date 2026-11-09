using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Testcontainers.PostgreSql;
using Xunit;

public sealed class AdmissionApiTests : IAsyncLifetime {
    private readonly PostgreSqlContainer postgres = new PostgreSqlBuilder().WithImage("postgres:16-alpine").Build();
    private WebApplicationFactory<Program> factory = null!;
    private HttpClient client = null!;
    public async Task InitializeAsync() {
        await postgres.StartAsync();
        factory = new WebApplicationFactory<Program>().WithWebHostBuilder(b => b.ConfigureAppConfiguration((_, c) => c.AddInMemoryCollection(new Dictionary<string, string?> { ["ConnectionStrings:Default"] = postgres.GetConnectionString(), ["HOLD_DURATION_SECONDS"] = "600" })));
        client = factory.CreateClient();
        for (var i = 0; i < 40; i++) { try { await client.GetAsync("/health"); break; } catch { await Task.Delay(250); } }
    }
    public async Task DisposeAsync() { client.Dispose(); await factory.DisposeAsync(); await postgres.DisposeAsync(); }
    private async Task<string> CreateClass(int seats) { var response = await client.PostAsJsonAsync("/classes", new { name = Guid.NewGuid().ToString("N"), totalSeats = seats }); response.EnsureSuccessStatusCode(); return (await response.Content.ReadFromJsonAsync<ClassDto>())!.Id; }
    private HttpRequestMessage StudentRequest(HttpMethod method, string path, string student = "20152691234567890") { var r = new HttpRequestMessage(method, path); r.Headers.Add("X-Student-Id", student); return r; }

    [Fact] public async Task Class_creation_and_listing_returns_seat_counts() { var id = await CreateClass(3); var item = (await client.GetFromJsonAsync<List<ClassDto>>("/classes"))!.Single(c => c.Id == id); Assert.Equal(3, item.TotalSeats); Assert.Equal(3, item.AvailableSeats); }
    [Fact] public async Task Confirm_is_idempotent_and_student_scoped() { var id = await CreateClass(2); var created = await client.SendAsync(StudentRequest(HttpMethod.Post, $"/classes/{id}/holds")); var hold = (await created.Content.ReadFromJsonAsync<HoldDto>())!; var other = await client.SendAsync(StudentRequest(HttpMethod.Post, $"/holds/{hold.HoldId}/confirm", "20152691234567891")); Assert.Equal(HttpStatusCode.NotFound, other.StatusCode); for (var i = 0; i < 2; i++) { var confirmed = await client.SendAsync(StudentRequest(HttpMethod.Post, $"/holds/{hold.HoldId}/confirm")); confirmed.EnsureSuccessStatusCode(); } var klass = await client.GetFromJsonAsync<ClassDto>($"/classes/{id}"); Assert.Equal(1, klass!.ConfirmedSeats); }
    [Fact] public async Task Concurrent_requests_never_allocate_more_than_capacity() { var id = await CreateClass(5); var requests = Enumerable.Range(0, 30).Select(i => { var request = StudentRequest(HttpMethod.Post, $"/classes/{id}/holds", (20000000000000000L + i).ToString()); return client.SendAsync(request); }); var responses = await Task.WhenAll(requests); Assert.Equal(5, responses.Count(r => r.StatusCode == HttpStatusCode.Created)); var klass = await client.GetFromJsonAsync<ClassDto>($"/classes/{id}"); Assert.True(klass!.HeldSeats + klass.ConfirmedSeats <= klass.TotalSeats); }
    private sealed record ClassDto(string Id, string Name, int TotalSeats, int HeldSeats, int ConfirmedSeats, int AvailableSeats);
    private sealed record HoldDto(string HoldId, string ClassId, string StudentId, string Status, DateTimeOffset ExpiresAt);
}
