# Deploying Company HR for a live demo (Render.com)

This gets you a real, shareable URL — no laptop needs to stay running. Three
pieces, all set up through Render's web dashboard (no command line):
PostgreSQL, the .NET API, and the React frontend.

Render doesn't have a native .NET buildpack, so the backend deploys via a
`Dockerfile` — that file is already sitting at `backend/ErpApi/Dockerfile`
in this project, so you don't need to write anything, just push it (Step 0).

---

## Step 0 — Push the Dockerfile to GitHub

1. Extract this zip over your existing folder as usual.
2. Open Visual Studio → **Source Control** panel (or **Git Changes**) →
   you should see `Dockerfile` and `.dockerignore` as new files.
3. Commit with a message like "Add Dockerfile for deployment" → **Push**.

## Step 1 — Create a Render account

1. Go to **render.com** → **Sign up** → sign up with **GitHub** (this also
   authorizes Render to see your repos, which you'll need in the next steps).

## Step 2 — Database (PostgreSQL)

1. Render dashboard → **New +** → **PostgreSQL**.
2. Name it something like `company-erp-db`. Pick a region close to you.
3. Click **Create Database**. Wait a minute or two while it provisions.
4. Once it's ready, scroll to **Connections** — you'll see fields like
   **Hostname**, **Port**, **Database**, **Username**, **Password**, and a
   ready-made **External Database URL**. Keep this page open, you'll need
   these values shortly.

**Load your schema into it**, using pgAdmin exactly like you have locally:
5. Open pgAdmin → right-click **Servers** → **Register → Server…**
6. **General tab**: name it "Render Company ERP".
7. **Connection tab**: paste in the Hostname, Port, Database name, Username,
   and Password from Render's Connections page. Save.
8. Once connected, open the **Query Tool** on this new server/database and
   run **`database/schema.sql`** — that alone sets up a complete database
   with the bootstrap SuperAdmin already seeded.

## Step 3 — Backend (.NET API)

1. Render dashboard → **New +** → **Web Service**.
2. **Connect a repository** → pick your `company-erp` repo → **Connect**.
3. Configure:
   - **Name**: `company-erp-api`
   - **Region**: same as your database
   - **Root Directory**: leave blank (repo root)
   - **Runtime**: **Docker**
   - **Dockerfile Path**: `backend/ErpApi/Dockerfile`
   - **Docker Build Context Directory**: `backend/ErpApi`
   - **Instance Type**: Free (fine for a demo — note: free instances spin
     down after inactivity and take ~30-60 seconds to wake up on the first
     request after idling)
4. Scroll to **Environment Variables** → add these (values from Step 2's
   Connections page, and a freshly generated JWT key):
   | Key | Value |
   |---|---|
   | `ConnectionStrings__Default` | `Host=<hostname>;Port=<port>;Database=<database>;Username=<username>;Password=<password>` (build this from Render's Connections fields) |
   | `Jwt__Key` | a long random string — reuse the one from your local User Secrets, or generate a fresh one |
   | `Cors__AllowedOrigin` | leave as `http://localhost:5173` for now — you'll update this in Step 5 once you know your frontend's real URL |
5. Click **Create Web Service**. Render will build the Docker image and
   deploy — watch the **Logs** tab; this takes a few minutes the first time.
6. Once live, note the URL Render gives you, something like
   `https://company-erp-api.onrender.com`.
7. Test it: open `https://company-erp-api.onrender.com/swagger` in a browser
   — should show the same Swagger page you've seen locally.

## Step 4 — Frontend (React)

1. Render dashboard → **New +** → **Static Site**.
2. Connect the same repo.
3. Configure:
   - **Name**: `company-erp-app`
   - **Root Directory**: `frontend/erp-ui`
   - **Build Command**: `npm install && npm run build`
   - **Publish Directory**: `dist`
4. **Environment Variables** → add:
   | Key | Value |
   |---|---|
   | `VITE_API_BASE_URL` | `https://company-erp-api.onrender.com/api` (your actual backend URL from Step 3, plus `/api`) |
5. Click **Create Static Site**. Wait for the build to finish.
6. Note the URL Render gives you, something like
   `https://company-erp-app.onrender.com` — **this is the link you'll share
   for the demo.**

## Step 5 — Connect the last piece: CORS

Now that you know the frontend's real URL:

1. Go back to your **Web Service** (the backend) → **Environment**.
2. Edit `Cors__AllowedOrigin` → set it to your actual frontend URL from
   Step 4 (e.g. `https://company-erp-app.onrender.com`) — no trailing slash.
3. Save — Render redeploys the backend automatically with the new value.

## Step 6 — Test the whole thing

1. Open your frontend URL in a browser (or send it to whoever's demoing).
2. Log in with the bootstrap account: `superadmin@company.co` /
   `ChangeMe123!` — you'll be forced to set a new password immediately,
   same as locally.
3. Click around — Employees, Dashboard, Attendance Explorer.

## Notes for a business demo specifically

- **Free tier cold starts**: if nobody's used the app in ~15 minutes, the
  first click after that will take 30-60 seconds to respond while the
  backend wakes up. If you're demoing live, open the app and click around a
  little **5 minutes before** your meeting starts, so it's already warm.
- **This is demo infrastructure, not production**: free-tier databases on
  Render are fine for a demo but not meant for real ongoing use.
- **Real passwords**: change `ChangeMe123!` immediately (you'll be forced
  to anyway), and don't put real employee data in a deployment meant to
  stay a demo.
