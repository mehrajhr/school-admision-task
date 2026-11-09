# School Admission System

A small full-stack admission demo built with .NET 8, PostgreSQL and React. The API is available at `http://localhost:8080`; open the app at `http://localhost:3000`.

## Run with Docker

```sh
docker compose up --build
```

Docker Compose starts PostgreSQL, the API and the web app. Admission data is stored in the named `postgres_data` volume and survives container restarts and `docker compose down`. Use `docker compose down -v` only when you want to erase it.

The API accepts a configurable `ConnectionStrings__Default` connection string and `HOLD_DURATION_SECONDS` (default 600). The frontend API address is controlled by `VITE_API_BASE_URL` at build time. The default Docker setup proxies `/api` to the API container.

## Run tests

```sh
dotnet test backend/SchoolAdmission.Tests/SchoolAdmission.Tests.csproj
```

Frontend checks:

```sh
cd frontend
npm ci
npm test
```

## API

The API implements the assignment's class and hold endpoints. `X-Student-Id` must be a 17-digit student registration number for student-specific operations. Payment confirmation is simulated.
