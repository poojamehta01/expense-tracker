---
name: new-api-route
description: Add a new Express API route to server.js following all project rules
triggers: ["new route", "add api", "new endpoint", "add endpoint", "new api route"]
---

Rules — no need to read server.js:
- All routes are auto-protected by `requireAuth` (applied globally)
- Month sort: `ORDER BY ${MONTH_SORT}` — never `ORDER BY month`
- Exclude CC + Settlement: use `CC_EXCLUDE` constant
- SELECT → `.all(params)`, INSERT/UPDATE/DELETE → `.run(params)`
- Salary upsert: `INSERT INTO ... ON CONFLICT(...) DO UPDATE SET ...`
- Errors: `res.status(4xx).json({ error: '...' })`
- Place near related routes in the file

Route to add: $ARGUMENTS
