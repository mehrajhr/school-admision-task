# Assumptions

- A class means one grade and shift combination; its name is unique and seat capacity is a positive integer.
- Student IDs are exactly 17 digits. Login is out of scope, as specified; the header identifies the student for this demo.
- A held seat expires after `HOLD_DURATION_SECONDS` (600 seconds by default). Expired holds remain in history as `EXPIRED` and stop consuming capacity.
- A student can have one unexpired hold or one confirmed admission per class. Cancellation releases a held seat; confirmed admissions cannot be cancelled through this API.
- Class-scoped PostgreSQL advisory transaction locks serialize allocation across API processes. Expiry is also processed by a background service and lazily before allocation, so capacity is reclaimed without user traffic.
- The payment action always succeeds in this take-home app; no external payment provider is configured.
