# Vipra Realty — Admin panel + API (Node.js / Express + MySQL)

The same admin panel as the PHP build, rewritten as a **Node.js (Express) app** for Hostinger's
**Node.js hosting**. Server-rendered with EJS, MySQL via `mysql2`, sessions via `express-session`,
image uploads via `multer`, passwords via `bcryptjs`.

## Structure

```
app.js                 startup file (Hostinger points here); listens on process.env.PORT
package.json           dependencies + "start": node app.js
.env.sample            copy to .env OR set these as env vars in the Node.js panel
schema.sql             MySQL tables + seeded category tree
src/
  db.js                mysql2 connection pool
  middleware.js        login / master / CSRF guards
  mailer.js            MSG91 SMS + enquiry-alert helper (email is a stub to wire later)
routes/
  admin.js             login, dashboard, properties CRUD + image upload, CSV import, enquiries, users, change-password, install
  api.js               POST /api/enquiry, POST /api/verify-otp, GET /api/listings
views/                 EJS templates (+ partials/header, partials/footer)
public/admin.css       admin styling (served at /public/admin.css)
uploads/               property images are written here
```

Routes: `/admin/login`, `/admin/dashboard`, `/admin/properties`, `/admin/property-edit`,
`/admin/import`, `/admin/enquiries`, `/admin/users`, `/admin/change-password`, `/admin/install`
and the APIs under `/api/...`.

---

## A. Deploy on Hostinger (Node.js app)

### 1. Create the database
hPanel → **Databases → MySQL Databases**: create a database + user (strong password), grant all
privileges. Then **phpMyAdmin → Import → `schema.sql` → Go** (creates tables + seeds categories).

### 2. Create the Node.js application
hPanel → **Advanced → Node.js** (Setup Node.js App):
- **Node version:** 18 or newer.
- **Application root:** a folder you'll upload to, e.g. `viprarealty-node`.
- **Application URL:** `viprarealty.com` (root) — so the panel is at `viprarealty.com/admin`.
- **Application startup file:** `app.js`.

### 3. Upload the code
Upload everything in this folder **except `node_modules/`** into the application root
(File Manager / FTP, or the Git option below). `node_modules` is rebuilt on the server in step 5.

### 4. Set environment variables
In the Node.js app panel, add **Environment variables** (preferred on Hostinger) — or upload a `.env`:
`DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASS`, `SESSION_SECRET` (any long random string),
`MASTER_EMAIL`, `ADMIN_WHATSAPP`, and later `MSG91_AUTHKEY` / `MSG91_SENDER`.

### 5. Install dependencies + start
In the Node.js app panel click **Run NPM Install**, then **Start** (or Restart) the app.

### 6. Create the master account
Open **`https://viprarealty.com/admin/install`**, create the master (use `24vipra@gmail.com` or any
email). The install route self-disables once a master exists, so it's safe — remove it later if you like.
Log in at **`https://viprarealty.com/admin/login`**.

### 7. SSL + domain
Your domain already points to the account. hPanel → **Security → SSL** → install free SSL → **Force HTTPS**.
`app.js` already sets `trust proxy` so secure cookies work behind Hostinger's proxy.

### 8. OTP SMS (when ready)
Create MSG91/Twilio, complete India **DLT** registration, set `MSG91_AUTHKEY` / `MSG91_SENDER`.
Until then the 4-digit OTP is generated and stored but not texted (`src/mailer.js` holds the gateway call).

---

## B. GitHub

Repo: `https://github.com/pratsacharya/viprarealty.com_github.git`
`.env` and `node_modules/` and uploaded images are git-ignored.

```bash
git init
git add .
git commit -m "Vipra Realty admin panel (Node/Express + MySQL) v1"
git branch -M main
git remote add origin https://github.com/pratsacharya/viprarealty.com_github.git
git push -u origin main
```

Optional: hPanel → **Advanced → Git** to pull this repo into the application root, then **Run NPM Install**
and **Restart** on each deploy.

---

## Notes & next steps
- **Sessions** use the default in-memory store, so an app restart logs admins out. Fine for v1; for
  persistence, add a MySQL/Redis session store later.
- **Public website:** the `design/` pages aren't wired to the DB yet. When ready, serve them from the Node
  app (a static route) or `public_html`, have the grid/detail fetch `/api/listings.php`→ here `/api/listings`,
  and the enquiry form post to `/api/enquiry` then `/api/verify-otp`.
- **CSV import:** the admin reads CSV — open the Excel template and *Save As → CSV* first.
- Verified: routes load, all EJS views compile, the server boots and serves `/admin/login`, and DB/route
  errors return HTTP 500 (JSON on `/api`) **without crashing** the process. Run a full click-through against
  your live MySQL after deploying.
- This is a functional v1 matching the PRD; add rate-limiting on login/OTP and server-side image resizing
  before heavy production use.
