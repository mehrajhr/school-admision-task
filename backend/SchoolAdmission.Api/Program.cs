using System.ComponentModel.DataAnnotations;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);
var connection = builder.Configuration.GetConnectionString("Default") ?? "Host=localhost;Database=admissions;Username=postgres;Password=postgres";
builder.Services.AddDbContext<AdmissionDb>(o => o.UseNpgsql(connection));
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddHostedService<ExpiryWorker>();
builder.Services.AddCors(o => o.AddDefaultPolicy(p => p.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod()));
builder.Services.ConfigureHttpJsonOptions(o => o.SerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase);
var app = builder.Build();
app.UseCors();
app.Use(async (context, next) =>
{
    try { await next(); }
    catch (ValidationException e) { context.Response.StatusCode = 400; await context.Response.WriteAsJsonAsync(new { error = e.Message }); }
    catch (AdmissionException e) { context.Response.StatusCode = e.StatusCode; await context.Response.WriteAsJsonAsync(new { error = e.Message }); }
    catch (DbUpdateException) { context.Response.StatusCode = 409; await context.Response.WriteAsJsonAsync(new { error = "This request conflicts with an existing admission. Please refresh and try again." }); }
});

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AdmissionDb>();
    await db.Database.EnsureCreatedAsync();
    await db.Database.ExecuteSqlRawAsync("CREATE UNIQUE INDEX IF NOT EXISTS ux_holds_active_student_class ON holds (\"ClassId\", \"StudentId\") WHERE \"Status\" IN ('HELD', 'CONFIRMED')");
}

app.MapPost("/classes", async (CreateClass input, AdmissionDb db) =>
{
    if (string.IsNullOrWhiteSpace(input.Name) || input.Name.Trim().Length > 100) throw new ValidationException("Class name is required and must be at most 100 characters.");
    if (input.TotalSeats is < 1 or > 100000) throw new ValidationException("Seat capacity must be between 1 and 100000.");
    var item = new SchoolClass { Id = $"c_{Guid.NewGuid():N}", Name = input.Name.Trim(), TotalSeats = input.TotalSeats };
    db.Classes.Add(item); await db.SaveChangesAsync();
    return Results.Created($"/classes/{item.Id}", new { id = item.Id, name = item.Name, totalSeats = item.TotalSeats });
});
app.MapGet("/classes", async (AdmissionDb db, TimeProvider clock) => Results.Ok(await ClassViews(db, clock)));
app.MapGet("/classes/{classId}", async (string classId, AdmissionDb db, TimeProvider clock) =>
{
    var found = (await ClassViews(db, clock)).FirstOrDefault(x => x.Id == classId) ?? throw new AdmissionException(404, "Class not found.");
    return Results.Ok(found);
});
app.MapPost("/classes/{classId}/holds", async (string classId, HttpRequest request, AdmissionDb db, IConfiguration config, TimeProvider clock) =>
{
    var studentId = Student(request);
    var duration = int.TryParse(config["HOLD_DURATION_SECONDS"], out var seconds) && seconds > 0 ? seconds : 600;
    await using var tx = await db.Database.BeginTransactionAsync();
    await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtext({classId}))");
    var klass = await db.Classes.SingleOrDefaultAsync(c => c.Id == classId) ?? throw new AdmissionException(404, "Class not found.");
    var now = clock.GetUtcNow();
    await db.Holds.Where(h => h.ClassId == classId && h.Status == "HELD" && h.ExpiresAt <= now).ExecuteUpdateAsync(s => s.SetProperty(h => h.Status, "EXPIRED"));
    if (await db.Holds.AnyAsync(h => h.ClassId == classId && h.StudentId == studentId && (h.Status == "CONFIRMED" || (h.Status == "HELD" && h.ExpiresAt > now)))) throw new AdmissionException(409, "You already have an active application for this class.");
    var occupied = await db.Holds.CountAsync(h => h.ClassId == classId && (h.Status == "CONFIRMED" || (h.Status == "HELD" && h.ExpiresAt > now)));
    if (occupied >= klass.TotalSeats) throw new AdmissionException(409, "No seats are currently available in this class.");
    var hold = new AdmissionHold { Id = $"h_{Guid.NewGuid():N}", ClassId = classId, StudentId = studentId, Status = "HELD", ExpiresAt = now.AddSeconds(duration) };
    db.Holds.Add(hold); await db.SaveChangesAsync(); await tx.CommitAsync();
    return Results.Created($"/holds/{hold.Id}", new { holdId = hold.Id, classId = hold.ClassId, studentId = hold.StudentId, status = hold.Status, expiresAt = hold.ExpiresAt });
});
app.MapGet("/holds/{holdId}", async (string holdId, AdmissionDb db) =>
{
    var hold = await db.Holds.FindAsync(holdId) ?? throw new AdmissionException(404, "Application not found.");
    return Results.Ok(new { holdId = hold.Id, classId = hold.ClassId, status = EffectiveStatus(hold, DateTimeOffset.UtcNow), expiresAt = hold.ExpiresAt });
});
app.MapPost("/holds/{holdId}/confirm", async (string holdId, HttpRequest request, AdmissionDb db, TimeProvider clock) =>
{
    var student = Student(request); var hold = await db.Holds.FindAsync(holdId) ?? throw new AdmissionException(404, "Application not found.");
    if (hold.StudentId != student) throw new AdmissionException(404, "Application not found.");
    if (hold.Status == "CONFIRMED") return Results.Ok(new { holdId = hold.Id, status = hold.Status });
    if (hold.Status != "HELD" || hold.ExpiresAt <= clock.GetUtcNow()) { if (hold.Status == "HELD") { hold.Status = "EXPIRED"; await db.SaveChangesAsync(); } throw new AdmissionException(409, "This application has expired or is no longer active."); }
    hold.Status = "CONFIRMED"; await db.SaveChangesAsync(); return Results.Ok(new { holdId = hold.Id, status = hold.Status });
});
app.MapDelete("/holds/{holdId}", async (string holdId, HttpRequest request, AdmissionDb db, TimeProvider clock) =>
{
    var student = Student(request); var hold = await db.Holds.FindAsync(holdId) ?? throw new AdmissionException(404, "Application not found.");
    if (hold.StudentId != student) throw new AdmissionException(404, "Application not found.");
    if (hold.Status == "HELD" && hold.ExpiresAt <= clock.GetUtcNow()) hold.Status = "EXPIRED";
    else if (hold.Status == "HELD") hold.Status = "CANCELLED";
    await db.SaveChangesAsync(); return Results.NoContent();
});
app.MapGet("/me/holds", async (HttpRequest request, AdmissionDb db, TimeProvider clock) =>
{
    var student = Student(request);
    var now = clock.GetUtcNow();
    return Results.Ok(await db.Holds.Where(h => h.StudentId == student).OrderByDescending(h => h.CreatedAt).Select(h => new { holdId = h.Id, classId = h.ClassId, className = h.Class.Name, status = h.Status == "HELD" && h.ExpiresAt <= now ? "EXPIRED" : h.Status, expiresAt = h.ExpiresAt }).ToListAsync());
});
app.MapGet("/health", () => Results.Ok(new { status = "ok" }));
app.Run();

static async Task<List<ClassView>> ClassViews(AdmissionDb db, TimeProvider clock)
{
    var now = clock.GetUtcNow();
    var rows = await db.Classes.OrderBy(c => c.Name).Select(c => new ClassView(c.Id, c.Name, c.TotalSeats,
        c.Holds.Count(h => h.Status == "HELD" && h.ExpiresAt > now), c.Holds.Count(h => h.Status == "CONFIRMED"), 0)).ToListAsync();
    return rows.Select(c => c with { AvailableSeats = c.TotalSeats - c.HeldSeats - c.ConfirmedSeats }).ToList();
}
static string Student(HttpRequest request)
{
    var value = request.Headers["X-Student-Id"].ToString();
    if (!System.Text.RegularExpressions.Regex.IsMatch(value, @"^\d{17}$")) throw new ValidationException("X-Student-Id must contain exactly 17 digits.");
    return value;
}
static string EffectiveStatus(AdmissionHold hold, DateTimeOffset now) => hold.Status == "HELD" && hold.ExpiresAt <= now ? "EXPIRED" : hold.Status;
record CreateClass(string Name, int TotalSeats);
record ClassView(string Id, string Name, int TotalSeats, int HeldSeats, int ConfirmedSeats, int AvailableSeats);
sealed class AdmissionException(int statusCode, string message) : Exception(message) { public int StatusCode { get; } = statusCode; }

sealed class ExpiryWorker(IServiceScopeFactory scopes, TimeProvider clock, ILogger<ExpiryWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try { using var scope = scopes.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<AdmissionDb>(); await db.Holds.Where(h => h.Status == "HELD" && h.ExpiresAt <= clock.GetUtcNow()).ExecuteUpdateAsync(s => s.SetProperty(h => h.Status, "EXPIRED"), stoppingToken); }
            catch (Exception e) when (!stoppingToken.IsCancellationRequested) { logger.LogWarning(e, "Could not process expired admission holds."); }
            await Task.Delay(TimeSpan.FromSeconds(2), stoppingToken);
        }
    }
}

sealed class AdmissionDb(DbContextOptions<AdmissionDb> options) : DbContext(options)
{
    public DbSet<SchoolClass> Classes => Set<SchoolClass>(); public DbSet<AdmissionHold> Holds => Set<AdmissionHold>();
    protected override void OnModelCreating(ModelBuilder model)
    {
        model.Entity<SchoolClass>(e => { e.ToTable("classes"); e.HasKey(x => x.Id); e.Property(x => x.Name).HasMaxLength(100).IsRequired(); e.HasIndex(x => x.Name).IsUnique(); });
        model.Entity<AdmissionHold>(e => { e.ToTable("holds"); e.HasKey(x => x.Id); e.Property(x => x.StudentId).HasMaxLength(17).IsRequired(); e.Property(x => x.Status).HasMaxLength(12).IsRequired(); e.HasOne(x => x.Class).WithMany(x => x.Holds).HasForeignKey(x => x.ClassId).OnDelete(DeleteBehavior.Restrict); e.HasIndex(x => new { x.ClassId, x.ExpiresAt }); });
    }
}
sealed class SchoolClass { public string Id { get; set; } = ""; public string Name { get; set; } = ""; public int TotalSeats { get; set; } public List<AdmissionHold> Holds { get; set; } = []; }
sealed class AdmissionHold { public string Id { get; set; } = ""; public string ClassId { get; set; } = ""; public SchoolClass Class { get; set; } = null!; public string StudentId { get; set; } = ""; public string Status { get; set; } = "HELD"; public DateTimeOffset ExpiresAt { get; set; } public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow; }
public partial class Program { }
