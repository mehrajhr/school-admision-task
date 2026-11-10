using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Npgsql;
using Testcontainers.PostgreSql;
using Xunit;

public sealed class AdmissionApiTests : IAsyncLifetime {
    private readonly PostgreSqlContainer postgres = new PostgreSqlBuilder()
        .WithImage("postgres:16-alpine")
        .WithDatabase("admissions_test")
        .WithUsername("postgres")
        .WithPassword("admissions_test_password")
        .Build();
    private WebApplicationFactory<Program> factory = null!;
    private HttpClient client = null!;
    private string? previousConnectionString;
    public async Task InitializeAsync() {
        await postgres.StartAsync();
        previousConnectionString = Environment.GetEnvironmentVariable("ConnectionStrings__Default");
        Environment.SetEnvironmentVariable("ConnectionStrings__Default", postgres.GetConnectionString());
        factory = new WebApplicationFactory<Program>();
        client = factory.CreateClient();
        for (var i = 0; i < 40; i++) { try { await client.GetAsync("/health"); break; } catch { await Task.Delay(250); } }
    }
    public async Task DisposeAsync() { client.Dispose(); await factory.DisposeAsync(); await postgres.DisposeAsync(); Environment.SetEnvironmentVariable("ConnectionStrings__Default", previousConnectionString); }
    private async Task<string> CreateClass(int seats) { var response = await client.PostAsJsonAsync("/classes", new { name = Guid.NewGuid().ToString("N"), totalSeats = seats }); response.EnsureSuccessStatusCode(); return (await response.Content.ReadFromJsonAsync<ClassDto>())!.Id; }
    private HttpRequestMessage StudentRequest(HttpMethod method, string path, string student = "20152691234567890") { var r = new HttpRequestMessage(method, path); r.Headers.Add("X-Student-Id", student); return r; }

    [Fact] public async Task Class_creation_and_listing_returns_seat_counts() { var id = await CreateClass(3); var item = (await client.GetFromJsonAsync<List<ClassDto>>("/classes"))!.Single(c => c.Id == id); Assert.Equal(3, item.TotalSeats); Assert.Equal(3, item.AvailableSeats); }
    [Fact] public async Task Confirm_is_idempotent_and_student_scoped() { var id = await CreateClass(2); var created = await client.SendAsync(StudentRequest(HttpMethod.Post, $"/classes/{id}/holds")); var hold = (await created.Content.ReadFromJsonAsync<HoldDto>())!; var other = await client.SendAsync(StudentRequest(HttpMethod.Post, $"/holds/{hold.HoldId}/confirm", "20152691234567891")); Assert.Equal(HttpStatusCode.NotFound, other.StatusCode); for (var i = 0; i < 2; i++) { var confirmed = await client.SendAsync(StudentRequest(HttpMethod.Post, $"/holds/{hold.HoldId}/confirm")); confirmed.EnsureSuccessStatusCode(); } var duplicate = await client.SendAsync(StudentRequest(HttpMethod.Post, $"/classes/{id}/holds")); Assert.Equal(HttpStatusCode.Conflict, duplicate.StatusCode); var klass = await client.GetFromJsonAsync<ClassDto>($"/classes/{id}"); Assert.Equal(1, klass!.ConfirmedSeats); }
    [Fact] public async Task Concurrent_requests_never_allocate_more_than_capacity() { var id = await CreateClass(5); var requests = Enumerable.Range(0, 30).Select(i => { var request = StudentRequest(HttpMethod.Post, $"/classes/{id}/holds", (20000000000000000L + i).ToString()); return client.SendAsync(request); }); var responses = await Task.WhenAll(requests); Assert.Equal(5, responses.Count(r => r.StatusCode == HttpStatusCode.Created)); var klass = await client.GetFromJsonAsync<ClassDto>($"/classes/{id}"); Assert.True(klass!.HeldSeats + klass.ConfirmedSeats <= klass.TotalSeats); }
    [Fact] public async Task Hold_reads_and_cancellation_release_the_seat() { const string student = "20152691234567890"; var id = await CreateClass(1); var response = await client.SendAsync(StudentRequest(HttpMethod.Post, $"/classes/{id}/holds", student)); var hold = (await response.Content.ReadFromJsonAsync<HoldDto>())!; var details = await client.GetFromJsonAsync<HoldDetailDto>($"/holds/{hold.HoldId}"); Assert.Equal("HELD", details!.Status); var mine = await client.SendAsync(StudentRequest(HttpMethod.Get, "/me/holds", student)); var applications = await mine.Content.ReadFromJsonAsync<List<MyHoldDto>>(); Assert.Contains(applications!, h => h.HoldId == hold.HoldId && h.ClassId == id); var cancelled = await client.SendAsync(StudentRequest(HttpMethod.Delete, $"/holds/{hold.HoldId}", student)); Assert.Equal(HttpStatusCode.NoContent, cancelled.StatusCode); var after = await client.GetFromJsonAsync<ClassDto>($"/classes/{id}"); Assert.Equal(1, after!.AvailableSeats); var final = await client.GetFromJsonAsync<HoldDetailDto>($"/holds/{hold.HoldId}"); Assert.Equal("CANCELLED", final!.Status); }
    [Fact] public async Task Expired_holds_are_reclaimed_without_a_request() { var id = await CreateClass(1); var response = await client.SendAsync(StudentRequest(HttpMethod.Post, $"/classes/{id}/holds")); var hold = (await response.Content.ReadFromJsonAsync<HoldDto>())!; await using (var connection = new NpgsqlConnection(postgres.GetConnectionString())) { await connection.OpenAsync(); await using var command = new NpgsqlCommand("UPDATE holds SET \"ExpiresAt\" = NOW() - INTERVAL '1 second' WHERE \"Id\" = @id", connection); command.Parameters.AddWithValue("id", hold.HoldId); await command.ExecuteNonQueryAsync(); } await Task.Delay(TimeSpan.FromSeconds(3)); var details = await client.GetFromJsonAsync<HoldDetailDto>($"/holds/{hold.HoldId}"); Assert.Equal("EXPIRED", details!.Status); var klass = await client.GetFromJsonAsync<ClassDto>($"/classes/{id}"); Assert.Equal(1, klass!.AvailableSeats); }
    [Fact] public async Task Invalid_inputs_return_client_errors() { var invalidClass = await client.PostAsJsonAsync("/classes", new { name = " ", totalSeats = 0 }); Assert.Equal(HttpStatusCode.BadRequest, invalidClass.StatusCode); var id = await CreateClass(1); var invalidStudent = await client.SendAsync(StudentRequest(HttpMethod.Post, $"/classes/{id}/holds", "not-a-student-id")); Assert.Equal(HttpStatusCode.BadRequest, invalidStudent.StatusCode); }
    private sealed record ClassDto(string Id, string Name, int TotalSeats, int HeldSeats, int ConfirmedSeats, int AvailableSeats);
    private sealed record HoldDto(string HoldId, string ClassId, string StudentId, string Status, DateTimeOffset ExpiresAt);
    private sealed record HoldDetailDto(string HoldId, string ClassId, string Status, DateTimeOffset ExpiresAt);
    private sealed record MyHoldDto(string HoldId, string ClassId, string ClassName, string Status, DateTimeOffset ExpiresAt);
}
