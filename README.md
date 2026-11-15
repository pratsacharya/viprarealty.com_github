# Vipra Realty — viprarealty.com

Property listing & enquiry website for Vipra Realty (real-estate consultancy, Bangalore).

This is a **listing-and-enquiry site, not a marketplace**: the owner (master admin) publishes
rental and sale listings across residential and commercial categories, and seekers browse and
enquire via an OTP-verified form or WhatsApp. There is no buyer login and no online payment.

> **Working on this repo with a coding agent?** Read **[`CLAUDE.md`](CLAUDE.md)** first — it is the
> full architecture + context handoff (data model, routes, category tree, deploy flow, conventions,
> and current status/known follow-ups).

## Repository layout

```
app/        Node.js (Express + MySQL) backend + admin panel + API + public site  ← this is what deploys
  app.js        Express entry point (mounts /adminvr and /api, serves site/ at web root)
  routes/       admin.js (admin panel), api.js (public JSON API)
  src/          db.js, bootstrap.js (schema/migrations/category tree), middleware.js, mailer.js
  views/        EJS templates for the admin panel
  site/         the live public website (static HTML + js/site.js), served at the web root
  public/       admin.css
  schema.sql    MySQL schema (also auto-created on first run — see below)
  uploads/      property images (created at runtime)
design/     Original static design mockups (reference only; the live site is app/site/)
docs/       PRD (Markdown + Word), project brief, and the Excel bulk-import template
```

## Tech stack

Node.js + Express 4, MySQL (via `mysql2`), EJS admin views, vanilla-JS public site (no build step),
`express-session` + `bcryptjs` auth, `multer` image upload, `csv-parse` bulk import, MSG91 for OTP SMS
(optional). Deployed as a Node.js app on Hostinger, auto-deployed from this GitHub repo.

## Quick start (local)

```bash
cd app
cp .env.sample .env        # fill DB_* + SESSION_SECRET
npm install
npm start                  # http://localhost:3000
```

On first run the app **auto-creates all tables** and seeds the category tree — no manual SQL import
needed (it reads `schema.sql`). Then:

1. Open `http://localhost:3000/adminvr/install` once to create the master account
   (email `24vipra@gmail.com` by default — see `MASTER_EMAIL`).
2. Log in at `http://localhost:3000/adminvr/login`.

## Deployment

Hostinger Node.js app, auto-deploying from **`pratsacharya/viprarealty.com_github`** (branch `main`).
Full steps — including the Hostinger DB username/prefix gotcha and environment variables — are in
**[`app/README-DEPLOY-NODE.md`](app/README-DEPLOY-NODE.md)**. The admin panel lives at
`https://viprarealty.com/adminvr/login`.

## Status

- **Backend / admin panel** — functional: master + sub-user roles, property CRUD with image upload,
  status & featured toggles, CSV bulk import, enquiries view, user management, self-bootstrapping
  install.
- **Public site** — live in `app/site/`, wired to the API: Home + Properties grids fetch
  `/api/listings`, filters cascade category→sub-category via `/api/categories`, the detail page loads
  by `?id=`, the Contact form posts `/api/enquiry` → `/api/verify-otp`, and the EMI calculator
  (home + sale detail page) is functional.
- **OTP SMS** — code is in place but **inactive** until an MSG91 account + India DLT templates are
  configured (`MSG91_AUTHKEY`). Until then the enquiry is still recorded; the SMS step is skipped.

See **[`CLAUDE.md`](CLAUDE.md)** → "Current status & known follow-ups" for the open items.
