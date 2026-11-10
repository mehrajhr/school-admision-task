# AI usage

OpenAI Codex was used to implement the API, database model, React interface, Docker setup, tests, and project documentation from the supplied assignment. The requirements were reviewed against the PDF before implementation. The frontend production build and both frontend tests pass. The backend builds and all six PostgreSQL integration tests pass, including concurrent seat allocation, expiry, ownership, cancellation, and input validation. The Compose API health endpoint and frontend page were also smoke-tested.

An initial backend test setup supplied its test database URL through app configuration, but the test host still connected to a different local database and failed authentication. The failing integration run exposed this; the fixture now sets the isolated Testcontainers connection string in the process environment before the host starts. The full integration suite then passed.
