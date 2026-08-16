# Setup using apps only (pgAdmin, Visual Studio, VS Code) — no typed commands

This walks through the same setup as the main README, but entirely through
application windows: installers, buttons, and menus. The only unavoidable
exception is noted in Step 3 (Node package installation has no non-CLI
equivalent — but VS Code's one-click **Tasks** get you as close as possible).

---

## Step 1 — Database, using pgAdmin

**Install:**
1. Download PostgreSQL from https://www.postgresql.org/download/ — the
   installer bundles **pgAdmin 4** automatically. Run it, keep the defaults,
   and set a password for the `postgres` superuser when prompted (remember it).

**Create the database:**
2. Open **pgAdmin 4**. In the left tree, expand **Servers → PostgreSQL** →
   enter the password you set → it connects.
3. Right-click **Databases → Create → Database…**
4. In the dialog: **Database name** = `company_erp` → click **Save**.

**Load the schema:**
5. Click on the new `company_erp` database to select it, then click the
   **Query Tool** icon in the toolbar (or right-click → Query Tool).
6. In the Query Tool, go to **File → Open…** and browse to
   `database/schema.sql` from the project (or open it in any text editor,
   copy everything, and paste it into the Query Tool panel).
7. Click the ▶ **Execute/Play** button (or press F5).
8. In the left tree, right-click **Tables** under `company_erp` → **Refresh**
   — you should see `employees`, `users`, `companies`, etc. Expand any table
   → **View/Edit Data → All Rows** to confirm the seed data loaded.

Database is ready. No terminal used.

---

## Step 2 — Backend API, using Visual Studio

**Install:**
1. Download **Visual Studio 2022 Community** (free) from
   https://visualstudio.microsoft.com/ — during install, tick the
   **"ASP.NET and web development"** workload. This also installs the
   .NET 8 SDK for you.

**Open the project:**
2. Launch Visual Studio → **Open a project or solution** → browse to
   `backend/ErpApi/ErpApi.sln` (included in the project) → Open.
   Solution Explorer on the right will show Controllers, Models, Data, etc.

**Configure the connection string and JWT key:**
3. In Solution Explorer, double-click **appsettings.json** to open it in the
   editor.
4. Update:
   - `"Default"` under `ConnectionStrings` → set the password to match what
     you chose in pgAdmin, e.g.
     `Host=localhost;Port=5432;Database=company_erp;Username=postgres;Password=<your-password>`
   - `"Key"` under `Jwt` → replace with any long random string (32+ characters).
5. Save the file (Ctrl+S / Cmd+S).

**NuGet packages:**
6. Visual Studio restores NuGet packages automatically when the solution
   loads. If you ever see a banner saying packages are missing, right-click
   the **ErpApi** project in Solution Explorer → **Restore NuGet Packages**.

**Run it:**
7. Make sure the dropdown at the top (next to the green ▶ Run button) shows
   **"ErpApi (http)"**.
8. Click the green ▶ **Run** button (or press F5).
9. Visual Studio builds the project and opens your browser to the Swagger
   page automatically (`http://localhost:5205/swagger`) — this is your API's
   interactive test console. Try `POST /api/auth/signup` here to confirm the
   database connection works before moving to the frontend.

*(Don't have Visual Studio / not on Windows? Use VS Code instead — open the
`backend/ErpApi` folder, install the **C# Dev Kit** extension, then use the
**Run and Debug** panel on the left → click ▶ next to "Run API (F5)". A
`launch.json` and `tasks.json` are already included so this works without
typing anything into a terminal.)*

---

## Step 3 — Frontend, using VS Code

**Install:**
1. Download **Node.js LTS** from https://nodejs.org — run the installer,
   keep the defaults.
2. Download **VS Code** from https://code.visualstudio.com if you don't have
   it.

**Open the project:**
3. Launch VS Code → **File → Open Folder…** → select `frontend/erp-ui`
   (or open `company-erp.code-workspace` from the project root, which opens
   backend + frontend + database together in one window).

**Install dependencies (one click):**
4. Go to the top menu **Terminal → Run Task…** → select **"Install
   Dependencies"**.
   This runs the equivalent of `npm install` for you inside a managed panel —
   you click a menu item, you don't type a command. Wait for it to finish
   (the panel will show "Terminal will be reused..." when done).

   > This is the one place a fully commandless path doesn't exist — Node
   > projects always install packages this way under the hood. The Task
   > above is the closest GUI equivalent: point-and-click, no typing.

**Configure the API URL:**
5. In the Explorer sidebar, open `.env`. Confirm it matches the port your
   API is running on:
   ```
   VITE_API_BASE_URL=http://localhost:5205/api
   ```
   Save if you changed it.

**Run it (one click):**
6. **Terminal → Run Task…** → select **"Start Dev Server"**.
7. Once the panel shows `Local: http://localhost:5173/`, hold Ctrl (Cmd on
   Mac) and click that link, or just open a browser to
   `http://localhost:5173`.

---

## Step 4 — Try the whole thing

1. In the browser: **Sign up** → fill the form → pick a role from the
   dropdown → submit. You're logged in and land on the Dashboard.
2. Click **Employees** in the sidebar → you should see the 5 seeded
   employees in the table.
3. Click **+ Add Employee**, fill in a name, click **Save Changes** → you're
   back on the list with the new row, and the Dashboard KPI counts update.
4. Click ✎ on a row to edit it, or 🗑 to deactivate it.

If a page shows a red error banner instead of data, it almost always means
the frontend can't reach the API — double check the API is still running in
Visual Studio (Step 2) and that the port in `.env` (Step 3) matches it.

---

## Quick troubleshooting (still no typing required)

| Symptom | Where to look |
|---|---|
| Frontend shows "Could not load dashboard stats" | Visual Studio — is the API still running (Step 2.8)? Check the Output window for errors. |
| Signup/Login fails | pgAdmin — Query Tool → `SELECT * FROM users;` to confirm the table exists and the connection string password (Step 2.4) is correct. |
| Blank white page in browser | VS Code — check the "Start Dev Server" task panel for red error text. |
| Swagger page won't open | Visual Studio — confirm the dropdown next to Run says "ErpApi (http)", not "IIS Express". |

---

## Security setup (do this once, before demoing beyond localhost)

The zip ships with a **placeholder** JWT signing key in `appsettings.json` so
the earlier steps in this guide would run. As of this update, the API now
**refuses to start** if that placeholder is still in place — so you need to
do this before running it again.

### Move secrets out of appsettings.json, using Visual Studio's built-in tool

1. In Visual Studio, right-click the **ErpApi** project in Solution Explorer
   (not the solution — the project itself).
2. Click **Manage User Secrets**.
3. This opens a file called `secrets.json` — it's stored **outside** your
   project folder (in your Windows user profile), so it never gets zipped,
   committed, or accidentally shared. Paste this in:

```json
{
  "Jwt:Key": "4yYBTO8mUOY6c2Kfk/iTxp1RUtMsgHx6Va5E4ASqOVt6uI7GX7t3yv/2P7PE3TE5",
  "ConnectionStrings:Default": "Host=localhost;Port=5432;Database=company_erp;Username=postgres;Password=YOUR_ACTUAL_POSTGRES_PASSWORD"
}
```

4. Replace `YOUR_ACTUAL_POSTGRES_PASSWORD` with your real PostgreSQL password.
5. Save (Ctrl+S) and close that tab.

**Why this works:** ASP.NET Core automatically layers User Secrets *on top
of* `appsettings.json` in Development — so these two values now come from
`secrets.json` instead, and you can leave the placeholder text sitting
harmlessly in `appsettings.json` (it's never actually used once secrets
are set). The startup check only fires if User Secrets is *not* set up.

6. Run the API again (F5) — it should start normally.

> The random key above was generated specifically for you in this
> conversation — it's fine to use for local development. If you ever deploy
> this somewhere other than your own machine, generate a fresh one and don't
> reuse this value.

### What else changed

- **Signup no longer lets you pick Admin/SuperAdmin** — except for the very
  first account ever created on a fresh database (so you can bootstrap your
  own admin without touching the database directly). Every signup after that
  is limited to `User` or `HR`.
- **To create an Admin or SuperAdmin account after that first one**, log in
  as an existing Admin/SuperAdmin and call `POST /api/auth/create-user`
  from the Swagger page (Authorize with your Bearer token first) — same
  fields as signup, but any role is allowed since it's admin-gated.
- **Bank Details and Proof/Documents (PAN, Aadhaar, account numbers) are now
  only viewable by HR, Admin, or SuperAdmin** — a plain `User` account can no
  longer see anyone's bank or ID information.
- Passwords now need to be **8+ characters with at least one letter and one
  number**, enforced on the server (not just the placeholder text in the UI).
