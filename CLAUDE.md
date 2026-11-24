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
- Auth: `express-session` + `bcryptjs`. Uploads: `multer`, resized with `sharp`. Excel import/export: `exceljs`. SMS: MSG91 (optional).
- Dependencies: `express, mysql2, ejs, express-session, bcryptjs, multer, sharp, exceljs, dotenv`.

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
    images.js         Photo resizing (sharp): WebP 1600 px + 600x450 card thumbnail.
    excel.js          Excel bulk export (workbook per sub-category) + import (add / update by Property ID).
    mailer.js         sendSms (MSG91; no-op if MSG91_AUTHKEY unset) + notifyMasterEnquiry (stub/TODO).
  views/              EJS admin templates + partials/ (header, footer).
  site/               LIVE public site: index.html, properties.html, property-detail.html, contact.html,
                      js/site.js, assets/logo.png.
  public/admin.css    Admin panel styles.
  schema.sql          MySQL schema (also auto-applied on first run).
  uploads/            Property images at runtime — local default only (.gitkeep committed).
                      Production sets UPLOAD_DIR (src/uploads.js) so images survive deploys.
design/               Original static mockups — REFERENCE ONLY. Live site is app/site/.
docs/                 PRD (MD + Word), brief, blank Excel listings template (same as /adminvr/template.xlsx).
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
`sale_price`, `monthly_rent`, `deposit_amount`, `down_payment`, `possession_date` (Buy only, shown as
"Expected possession"), `available_from` (Rent only, "Available from"), `brokerage`
(text, Rent and Buy, shown in the price breakdown), `image_label` (text on the photo instead of
For sale / For rent; Sold out / Rented out still win), `brochure_url` / `brochure_file`
(project brochure PDF, see 6c), `bedrooms`,
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
Residential: Flat, Villa, Pent House, Independent House, Independent Plot
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
- **Project details** (`PROJECT` in fields.js) — Project Area, Total Towers, Total Units, Unit Type (key `unit_types`; old "Unit Types" Excel header still imports),
  Tower / Block, Address, Landmark, Project Scale, Project RERA Number, Nearest Metro Station: text highlights appended to every type
  (`HIGHLIGHTS` = `BY_TYPE` + `PROJECT`), so the first-four stat tiles are unchanged.
- **Amenities** — one list for all types; tick + optional value.
- **Furnishings** — shown only when `search_type='Rent'` and the `furnishing` highlight is
  Semi-furnished / Fully furnished / Furnished (`furnishingsApply`). All optional.
- **Old spec columns** (`bedrooms, bathrooms, carpet_area, builtup_area, ceiling_height, floor_no,
  total_floors`) are no longer on the form. Highlights marked `col` write them on save
  (`legacyColumns`) because the listing cards and filters still read them. `backfillHighlights()`
  (startup) copies those columns into highlight rows for listings that have none.
- Admin form: `views/property-form.ejs` renders highlight rows client-side from the catalog for the
  selected sub-category. API: `/api/listings` adds `highlights[]`, `amenities[]`, `furnishings[]`
  (display flag + value applied). Detail page: first 4 highlights are the stat tiles, the rest
  "Property highlights", then Amenities and Furnishings.
- **To change fields, edit `fields.js` and redeploy.** Renaming a key orphans stored values.

## 6b. Excel import / export (`app/src/excel.js`)

Admin page **Import / Export** (`/adminvr/import`, master only). One sheet per sub-category
(`CATEGORY_TREE` order) plus a "How to use" sheet. Columns come from `columnsFor(subName)`: Property
ID, basics, price fields (`- Buy` / `- Rent` suffix), the sub-category's highlights, `Amenity: …`,
`Furnishing: …` (types with a Furnishing highlight), `Photo links`. Older files with a single "Possession date" column still import (used for the row's type). Mandatory headers are dark green
(title, Looking to, Status, City, Locality, Sale price for Buy / Monthly rent for Rent — an amount or
"On request"). Dropdowns via data validation.

Import rules: blank Property ID → insert; existing ID → update that listing (sub-category = sheet, so
moving a row to another sheet re-files it); unknown ID / duplicate ID / missing mandatory → row reported,
not saved. An empty cell clears the value. Listings are never deleted. Highlight "show on site" flags are
kept for existing keys, new values default to shown. **Photo links** are downloaded at import into UPLOAD_DIR (jpg/png/webp/gif, 8 MB, same as admin uploads);
`property_images.source_url` keeps the link (column added by `ensureImageSourceColumn()`). Google Drive / Dropbox
share links are first rewritten to direct image URLs (`lh3.googleusercontent.com/d/<id>`). A link already stored
for that listing is not fetched again; a link removed from the cell deletes that photo and its file; older rows
whose `file_path` is a web URL are converted on the next import. Export lists `source_url` (or the web URL).
Admin-uploaded photos (no `source_url`) are never touched. A link that does not return an image (e.g. a private
Drive file) is skipped and listed in `report.warnings`.
A **Google Drive folder link** (`drive.google.com/drive/folders/<id>`) expands to every image in the folder
(read from the public `embeddedfolderview` page, no API key; sorted by file name, videos skipped, max 20).
If a folder can't be opened, the listing's link photos are left as they are. Downloads run 4 at a time.
Each row saves in its own transaction. Headers are matched by text —
renaming a field label in `fields.js` changes the header, so re-export after such a change. An unchanged
export → import round trip leaves the data identical (verified).

## 6c. Project brochure (`app/src/brochures.js`)

Admin form field "Project brochure (PDF link)" and Excel column "Project brochure link". The link (Google
Drive file → `drive.usercontent.google.com/download?...&confirm=t`, Dropbox → `dl=1`, or a direct PDF) is
downloaded once (must start with `%PDF-`, ≤ 40 MB) into `UPLOAD_DIR/brochures`; `brochure_url` keeps the
link, `brochure_file` the stored name. Same link again = no re-download; blank link = file removed; a failed
download keeps the old brochure and is reported (admin: `?brochure_error=`; import: `report.warnings`).
`/uploads/brochures` is blocked in `app.js`. The public API only gives `has_brochure`. On the detail page the
"View Project Brochure" button (next to "About this property") swaps the photo gallery for a page-flip book
(`initBrochure` in site.js; no enquiry/OTP): PDF.js draws each page on a canvas and StPageFlip turns them
(both self-hosted in `site/vendor/`, loaded only on click). Controls: prev/next, page count, slideshow
(3.5 s, loops), full screen, X to close (Esc too); two-page spread when wide, one page on phones; rebuilt on resize.
View-only: `GET /api/brochure/:id` answers only with header `X-Brochure-View: 1` and sends the bytes XOR-scrambled
with a one-time key (`X-Brochure-Key`), `no-store`; right-click, drag, copy, Ctrl/Cmd+S/P and printing are blocked
on the viewer. This deters casual saving only — anyone viewing can still screenshot. Admin view (real PDF):
`GET /adminvr/properties/:id/brochure`.

## 7. Routes

**Admin (`/adminvr/*`, in `routes/admin.js`; all auth-gated except install/login):**
`GET/POST /install` (first-run master creation, self-bootstraps schema), `GET/POST /login`,
`GET /logout`, `GET /dashboard`, `GET /properties`, `GET /properties/:id/status|feature|delete`,
`GET/POST /property-edit` (add/edit, multer image upload ≤20),
`GET /properties/:id/images/:imgId/delete` and `/properties/:id/images/prune` (master: remove one photo /
all photo records whose file is missing), `GET/POST /change-password`,
`GET /enquiries`, `GET/POST /users` (master only), `GET /users/:id/delete`, `GET/POST /import`,
`GET /export.xlsx`, `GET /template.xlsx` (Excel, master only — see 6b).

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

**Photo sizes (`src/images.js`):** every stored photo (admin upload, Excel photo link) is converted to
`p_<id>.webp` (longest side ≤ 1600 px, q80) for the gallery plus `p_<id>_t.webp` (600×450 centre crop,
q80) for cards; the DB keeps only the `.webp` path and `thumbOf()` finds the thumbnail by name. The API
returns `images` and `thumbs`. Originals are moved to `UPLOAD_DIR/originals` as a backup. On startup
`convertExisting()` converts older photos. If `sharp` cannot load, photos are stored unresized.

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
  1. ~~Excel import template~~ — replaced by the Excel import/export (6b); template regenerated.
  2. **Detail sidebar "Sale price" label** is static text — shows "Sale price" even for rent listings
     (the value is correct). Make it reflect `search_type`.
  3. **MSG91 OTP SMS** not configured — needs an account + India DLT templates, then `MSG91_AUTHKEY`.
  4. **`notifyMasterEnquiry`** is a stub — wire real email (SMTP) to `MASTER_EMAIL`.
  5. Consider a `sort_order` column for sub-categories if manual ordering beyond `CATEGORY_TREE` order
     is ever needed (currently ordered by the tree).
