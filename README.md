# School Admission System

A full-stack admission demo built with .NET 8, PostgreSQL and React, styled with Tailwind CSS and DaisyUI. The API is available at `http://localhost:8080`; open the app at `http://localhost:3000`.

## Run with Docker

```sh
docker compose up --build
```

Docker Compose starts PostgreSQL, the API and the web app. Admission data is stored in the named `postgres_data` volume and survives container restarts and `docker compose down`. Use `docker compose down -v` only when you want to erase it.

The API normally opens at `http://localhost:8080`. If port 8080 is already in use, use one of these options:

- Windows Command Prompt: run `set "API_PORT=8081"`, then `docker compose up --build` in the same window.
- PowerShell: run `$env:API_PORT = "8081"`, then `docker compose up --build` in the same window.
- To keep the setting between terminals, put `API_PORT=8081` in the root `.env` file.

The web app continues to proxy API requests internally, so it remains available at `http://localhost:3000`.

Set `DATABASE_URL` to change the PostgreSQL connection string, `HOLD_DURATION_SECONDS` to change the reservation window (default 600), and `VITE_API_BASE_URL` to change the API address baked into the frontend build (default `/api`). The default Docker setup proxies `/api` to the API container. These values can go in a root `.env` file.

## Run tests

```sh
dotnet test backend/SchoolAdmission.Tests/SchoolAdmission.Tests.csproj
```

The backend integration tests launch an isolated PostgreSQL container, so Docker must be running. The frontend tests need Node.js and npm.

Frontend checks:

```sh
cd frontend
npm ci
npm test
```

## API

The API implements the assignment's class and hold endpoints. `X-Student-Id` must be a 17-digit student registration number for student-specific operations. Payment confirmation is simulated.
