# Company HR — ERP Starter (React + .NET API + PostgreSQL)

This is a working scaffold matching the UI you approved: JWT auth with 4 roles,
a Dashboard, an Employee list with Edit/Delete, and an Employee profile with
Basic/Bank/Proof/Address/Education/Shift sub-pages.

```
erp-system/
├── database/schema.sql        ← run this first
├── backend/ErpApi/            ← ASP.NET Core 8 Web API
└── frontend/erp-ui/           ← React (Vite)
```

> **Prefer clicking over typing?** See **[SETUP-GUI.md](./SETUP-GUI.md)** for
> the same setup done entirely through pgAdmin, Visual Studio, and VS Code —
> no terminal commands. The steps below use the CLI instead.

## 1. Database

1. Install PostgreSQL (or run `docker run -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:16`).
2. Create the database and load the schema:
   ```bash
   createdb company_erp
   psql -d company_erp -f database/schema.sql
   ```
   This creates all tables and seeds 5 sample employees, 3 companies, 2 shift
   templates, and one login (`admin@company.co`) — see note below on the seeded
   password hash.

## 2. Backend (.NET 8 Web API)

Requires the [.NET 8 SDK](https://dotnet.microsoft.com/download).

```bash
cd backend/ErpApi
dotnet restore
```

Edit `appsettings.json`:
- `ConnectionStrings:Default` → your Postgres connection string
- `Jwt:Key` → replace with a real random 32+ character secret
- `Cors:AllowedOrigin` → leave as `http://localhost:5173` for local dev

Run it:
```bash
dotnet run
```
By default this listens on `http://localhost:5205` (check the console output
for the exact port — `launchSettings.json` isn't included, so note the port
printed on startup and update the frontend `.env` if it differs).

Swagger UI is available at `http://localhost:5205/swagger` for testing
endpoints directly (Authorize with `Bearer <token>` after logging in).

**About the seeded admin login:** the password hash in `schema.sql` is a
placeholder. Easiest path — just use the **Sign up** screen once the frontend
is running to create your own Admin/SuperAdmin account; that goes through the
real BCrypt hashing path and avoids any doubt about the seed hash.

## 3. Frontend (React + Vite)

Requires [Node.js 18+](https://nodejs.org).

```bash
cd frontend/erp-ui
npm install
npm run dev
```
Opens at `http://localhost:5173`. Check `.env` — `VITE_API_BASE_URL` must
match the port your API is actually running on.

## 4. Try it end-to-end

1. Open `http://localhost:5173` → **Sign up** → pick a role from the dropdown
   (this is now a `<select>`, not the pill picker from the earlier mockup) →
   you're logged in and redirected to the Dashboard.
2. **Dashboard** — KPI cards and the department chart are computed live by
   `GET /api/dashboard/stats` from whatever's in the `employees` table.
3. **Employees** — table view, search box, Regular/Contract filter chips,
   ✎ Edit and 🗑 Delete per row.
4. **+ Add Employee** — opens the same tabbed profile form in "add" mode;
   Basic Details + Bank Details save together on **Save Changes**. Proof,
   Address and Education tabs need the employee to exist first (their inputs
   explain this), so add the employee, then reopen it via Edit to attach
   those.
5. **Delete** on the list is a **soft delete** — it sets the employee to
   `Inactive` and stamps `date_of_leaving`, it does not remove the row from
   the database. That's deliberate: HR systems need to retain historical
   records. A hard delete exists at `DELETE /api/employees/{id}?hard=true`
   but is restricted to the `SuperAdmin` role.

## What's stubbed vs fully wired

Fully wired: Auth (signup/login/JWT), Employees (list/create/update/soft-delete),
Bank Details (upsert), Proof (add/delete), Address (upsert per type),
Education (add/delete), Dashboard stats, lookups (companies/departments/locations).

Stubbed (schema + API endpoints exist, UI picker not yet built): the
**Employment/Shift** tab. `GET/POST /api/shift-templates` and
`GET/POST /api/employees/{id}/shift-assignment` are ready — the two seeded
templates (Day Shift / Night Shift) are sitting in the database — it just
needs a dropdown wired into `EmployeeProfile.jsx` to assign one, which is a
natural next increment once you've confirmed the rest works end-to-end.

## Auth / roles notes

- Roles: `User`, `HR`, `Admin`, `SuperAdmin`. Write endpoints (create/update/
  delete employees and sub-records) require `HR`, `Admin`, or `SuperAdmin`;
  plain `User` accounts are read-only. Adjust the `[Authorize(Roles=...)]`
  attributes in the controllers if you want different boundaries.
- Per your spec, there's no refresh-token flow — a JWT is generated **once, at
  signup**, and every login after that reuses the same stored token rather
  than minting a new one. The token's own expiry is set to 1 year
  (`ExpiryMinutes` in `appsettings.json`), long enough that this "same token
  forever" behavior works without you needing to handle expiry/refresh in
  the normal course of using the app.
- CORS is locked to `http://localhost:5173` — update `Cors:AllowedOrigin` if
  you serve the frontend elsewhere.
