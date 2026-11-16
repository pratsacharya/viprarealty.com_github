# CLAUDE.md — Vipra Realty developer context

Context for a coding agent continuing work on this repo. Read this before making changes.

## 1. What this is

A **property listing & enquiry website** for Vipra Realty, a real-estate consultancy in Bangalore.
It is **not a marketplace**: the owner (master admin) publishes listings; seekers browse and enquire.
No buyer accounts, no payments. Two sides:

- **Public site** (`app/site/`) — browse listings, filter, view a listing, submit an OTP-verified enquiry.
- **Admin panel** (`/adminvr/*`) — master + sub-users manage listings, enquiries, users, bulk import.

## 2. Tech stack

- **Node.js + Express 4** (single process, `app/app.js`).
- **MySQL** via `mysql2/promise` (`app/src/db.js` connection pool).
- **EJS** templates for the admin panel (`app/views/`).
- **Vanilla JS** public site (`app/site/js/site.js`) — **no build step**, static HTML served directly.
- Auth: `express-session` + `bcryptjs`. Uploads: `multer`. CSV import: `csv-parse`. SMS: MSG91 (optional).
- Dependencies: `express, mysql2, ejs, express-session, bcryptjs, multer, csv-parse, dotenv`.

## 3. Repo map

```
app/
  app.js              Express entry: static /public & /uploads, session, mounts /adminvr + /api,
                      serves site/ at web root, 404 + central error handler, then startup DB maintenance.
  routes/
    admin.js          All /adminvr/* routes (auth-gated). Async handlers auto-wrapped to the error handler.
    api.js            Public JSON API under /api/*.
  src/
    db.js             mysql2 pool from DB_* env vars.
    bootstrap.js      Schema auto-create, DB error messages, category-tree reconcile, legacy-column drop.
    middleware.js     requireLogin / requireMaster / csrfToken / checkCsrf.
    fields.js         Type-aware field catalog: highlights per sub-category, amenities, furnishings.
    uploads.js        Upload folder (UPLOAD_DIR), file helpers, storage diagnostics.
    mailer.js         sendSms (MSG91; no-op if MSG91_AUTHKEY unset) + notifyMasterEnquiry (stub/TODO).
  views/              EJS admin templates + partials/ (header, footer).
  site/               LIVE public site: index.html, properties.html, property-detail.html, contact.html,
                      js/site.js, assets/logo.png.
  public/admin.css    Admin panel styles.
  schema.sql          MySQL schema (also auto-applied on first run).
  uploads/            Property images at runtime — local default only (.gitkeep committed).
                      Production sets UPLOAD_DIR (src/uploads.js) so images survive deploys.
design/               Original static mockups — REFERENCE ONLY. Live site is app/site/.
docs/                 PRD (MD + Word), brief, Excel import template.
```

## 4. Running locally

```bash
cd app && cp .env.sample .env   # fill DB_* + SESSION_SECRET
npm install && npm start        # http://localhost:3000
```

First run auto-creates tables + seeds categories (no manual SQL). Then visit `/adminvr/install` once to
create the master account, then `/adminvr/login`.

## 5. Data model (`app/schema.sql`)

Tables: `users`, `categories`, `sub_categories`, `properties`, `property_images`, `enquiries`,
`otp_logs`, `import_batches`, `property_fields` (see 6a).

**`properties` key columns:** `project_title` (the single **Property Title** — the listing headline),
`description`, `search_type` ENUM('Rent','Buy'), `category_id`, `sub_category_id`, `city`, `locality`,
`sale_price`, `monthly_rent`, `deposit_amount`, `down_payment`, `possession_date`, `bedrooms`,
`bathrooms`, `carpet_area`, `builtup_area`, `total_floors`, `floor_no`, `ceiling_height`,
`status` ENUM('active','inactive','sold_out','rented_out'), `featured`, `created_by`, timestamps.

A listing is **public only when `status='active'`**. `featured=1` also shows it in the home featured strip.

**Removed/retired (do not reintroduce):**
- `builder_name`, `building_name` — merged into the single `project_title`.
- `listing_type` (Resale / Under Construction) — removed entirely; listings are classified by
  `search_type` + category/sub-category only.

These three columns are dropped from `schema.sql` and from any live DB automatically on startup by
`bootstrap.dropLegacyColumns()` (idempotent; checks `information_schema` then `ALTER TABLE ... DROP COLUMN`).

## 6. Category tree (single source of truth)

`bootstrap.js` exports **`CATEGORY_TREE`** — the canonical category → sub-category map:

```
Residential: Flats, Villas, Pent House, Independent House, Independent Plots
Commercial:  Office Space, Retail Store, Warehouse, Land
```

- On startup, `ensureCategoryTree()` reconciles the live DB to this map: adds missing sub-categories,
  removes retired ones **if unused by any property**. **To change the sub-category list, edit
  `CATEGORY_TREE` and redeploy — do not hand-edit the DB.**
- `GET /api/categories` returns the tree (from the DB) for the public filters.
- **Cascade:** selecting a Category filters the Sub-category options — in the admin form
  (`views/property-form.ejs`, inline script using `data-cat`) and on the public site
  (`site.js` `wireCascade()` for the home hero and the properties filter).

## 6a. Type-aware fields (`app/src/fields.js`)

Extra listing fields are a **fixed catalog in code**; values live in `property_fields`
(`property_id, grp, field_key, value, display`), `grp` = `highlight` | `amenity` | `furnishing`.

- **Highlights** — one set per sub-category (`HIGHLIGHTS['Office Space']`, …). Each has a key, label,
  `text`/`select` type; per listing a value + "show on site" flag. `rentOnly` fields appear for Rent only.
- **Amenities** — one list for all types; tick + optional value.
- **Furnishings** — shown only when `search_type='Rent'` and the `furnishing` highlight is
  Semi-furnished / Fully furnished / Furnished (`furnishingsApply`). All optional.
- **Old spec columns** (`bedrooms, bathrooms, carpet_area, builtup_area, ceiling_height, floor_no,
  total_floors`) are no longer on the form. Highlights marked `col` write them on save
  (`legacyColumns`) because the listing cards and filters still read them. `backfillHighlights()`
  (startup + after CSV import) copies those columns into highlight rows for listings that have none.
- Admin form: `views/property-form.ejs` renders highlight rows client-side from the catalog for the
  selected sub-category. API: `/api/listings` adds `highlights[]`, `amenities[]`, `furnishings[]`
  (display flag + value applied). Detail page: first 4 highlights are the stat tiles, the rest
  "Property highlights", then Amenities and Furnishings.
- **To change fields, edit `fields.js` and redeploy.** Renaming a key orphans stored values.

## 7. Routes

**Admin (`/adminvr/*`, in `routes/admin.js`; all auth-gated except install/login):**
`GET/POST /install` (first-run master creation, self-bootstraps schema), `GET/POST /login`,
`GET /logout`, `GET /dashboard`, `GET /properties`, `GET /properties/:id/status|feature|delete`,
`GET/POST /property-edit` (add/edit, multer image upload ≤20),
`GET /properties/:id/images/:imgId/delete` and `/properties/:id/images/prune` (master: remove one photo /
all photo records whose file is missing), `GET/POST /change-password`,
`GET /enquiries`, `GET/POST /users` (master only), `GET /users/:id/delete`, `GET/POST /import` (CSV).

**Public API (`/api/*`, in `routes/api.js`):**
- `GET /categories` — category→sub-category tree.
- `GET /listings` — filters: `search_type, city, category, sub, q, id, featured`; returns active
  listings with an `images[]` array. Photo records whose file is missing on disk are left out.
- `POST /enquiry` — creates an enquiry + issues a **4-digit OTP** (MSG91 SMS if configured).
- `POST /verify-otp` — verifies within 10 min, notifies master, sends a thank-you.

## 8. Public site (`app/site/js/site.js`)

One IIFE with per-page inits run on `DOMContentLoaded`: `initHome`, `initProperties`, `initDetail`,
`initContact`, `initEMI`. Each guards on a page-specific element so it's safe to run on every page.
Data comes only from `/api/*`. Key pieces:

- **Listings**: `getListings(params)` → `/api/listings`; `cardHTML(l)` renders a card.
- **Filters** (properties page): placeholder options have **empty values** (an "All cities" option with a
  non-empty value would filter to nothing — this was a real bug, keep placeholders value="").
- **Cascade**: `loadTree()` caches `/api/categories`; `wireCascade(catId, subId, tree)` rebuilds the
  sub-category `<select>`.
- **EMI calculator** (`initEMI`): fields Property Value, Down Payment, auto Loan Amount (= value − down),
  Interest rate, Tenure with a **Yrs/Mths** toggle → Monthly EMI (standard amortization, zero-interest
  fallback). Present on the home page and, for **sale (Buy) listings only**, on the detail page
  (`#emi-detail`, prefilled from the listing). Same element ids on both pages, so `initEMI` wires either.

## 9. Auth, enquiry/OTP, notifications

- **Roles:** `master` (full access incl. user management + delete) and `sub` (restricted). Passwords
  bcrypt-hashed; sessions via `express-session`; CSRF token on mutating admin forms (`middleware.js`).
- **Enquiry/OTP:** seeker submits name/mobile/requirement → 4-digit OTP (`crypto.randomInt`) → verify
  within 10 min → enquiry marked verified, master notified. WhatsApp is a `wa.me/<ADMIN_WHATSAPP>` link.
- **MSG91:** `mailer.sendSms` returns false (no-op) when `MSG91_AUTHKEY` is unset, so the app runs fine
  without SMS. `notifyMasterEnquiry` is a **stub** (TODO: real email via SMTP/nodemailer).

## 10. Environment variables (`app/.env.sample`)

`DB_HOST` (Hostinger: `localhost`), `DB_NAME`, `DB_USER`, `DB_PASS`, `SESSION_SECRET`, `MASTER_EMAIL`
(= `24vipra@gmail.com`), `ADMIN_WHATSAPP` (= `919108598918`). Optional, only for live OTP:
`MSG91_AUTHKEY`, `MSG91_SENDER`.

`UPLOAD_DIR` — folder for uploaded property images. A bare name or `~/name` resolves against the home
folder (on Hostinger `/home/<account>/domains/viprarealty.com`), an absolute path is used as given, and an
unusable folder falls back to `app/uploads`. Unset = `app/uploads`. On Hostinger the app folder is a
per-deploy build directory (`.../hbuilds/versions/<id>/nodejs`), so nothing inside it survives a deploy.
**Must be set on Hostinger to a path outside the app root** (e.g. `~/vipra-uploads`): a Git deploy
replaces the app folder and wipes images stored inside it. Always resolve image files through
`src/uploads.js` (`UPLOAD_DIR`, `diskPath`), never `path.join(__dirname, 'uploads')`.

**Hostinger gotcha:** MySQL DB and user names are auto-prefixed with the account id (e.g.
`u707964325_viprarealty_d` / `u707964325_viprarealty_u`). `DB_NAME`/`DB_USER` must use the **full
prefixed** names, or you get `ER_ACCESS_DENIED_ERROR`.

## 11. Deployment flow

- Hosted as a **Node.js app on Hostinger**, auto-deploying from **`pratsacharya/viprarealty.com_github`**
  branch `main`. (Earlier a separate `…_github-cloned` repo was wrongly connected — do not use it.)
- Push to `main` → Hostinger auto-deploys. Static `app/site/*` changes need the deploy to pull the new
  files; env-var changes need an app **restart**.
- Admin panel: `https://viprarealty.com/adminvr/login`. First-run setup: `/adminvr/install`.
- Full step-by-step: `app/README-DEPLOY-NODE.md`.

## 12. Conventions

- Prefer **minimal, functional code** over heavy abstractions. Keep the public site dependency-free
  (vanilla JS, no framework/build).
- Admin async route handlers are auto-wrapped to the central error handler — just `throw`/`await`.
- Server owns classification data (category tree); the client reads it from `/api/categories`.
- Validate `node -c` on changed JS and render-check EJS before pushing.

## 13. Current status & known follow-ups

- **Working:** admin CRUD + roles + import, public listings/filters/cascade, enquiry+OTP flow (SMS
  pending config), functional EMI calculators, self-bootstrapping install, auto schema migrations.
- **Known loose ends:**
  1. **Excel import template** (`docs/Vipra Realty - Property Import Template.xlsx`) still has the old
     Builder/Project/Building columns and the old sub-category list (incl. "Others"); the importer
     already tolerates a single "Property Title" and ignores extras, but the template should be
     regenerated to match (single Property Title; sub-categories: …, Pent House, no Others).
  2. **Detail sidebar "Sale price" label** is static text — shows "Sale price" even for rent listings
     (the value is correct). Make it reflect `search_type`.
  3. **MSG91 OTP SMS** not configured — needs an account + India DLT templates, then `MSG91_AUTHKEY`.
  4. **`notifyMasterEnquiry`** is a stub — wire real email (SMTP) to `MASTER_EMAIL`.
  5. Consider a `sort_order` column for sub-categories if manual ordering beyond `CATEGORY_TREE` order
     is ever needed (currently ordered by the tree).
