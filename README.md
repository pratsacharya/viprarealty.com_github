# Vipra Realty — viprarealty.com

Property listing & enquiry website for Vipra Realty (real-estate consultancy, Bangalore).
Listing-and-enquiry site (not a marketplace): the owner publishes rental and sale listings
(residential + commercial, resale + under-construction), and seekers browse and enquire via an
OTP-verified form or WhatsApp.

## Repository layout

```
app/        Node.js (Express + MySQL) backend + admin panel + API  ← deploy this to Hostinger
            see app/README-DEPLOY-NODE.md for full setup steps
design/     Static design mockups of the public pages (Home, Properties, Detail, Contact)
docs/       PRD (Word + Markdown), the project brief, and the Excel bulk-import template
```

## Quick start (backend)

```bash
cd app
cp .env.sample .env        # fill in DB credentials + SESSION_SECRET
npm install
# import app/schema.sql into MySQL, then:
npm start                  # http://localhost:3000  (admin at /admin/login)
```

Create the first master account at `/admin/install`, then log in at `/admin/login`.
Full Hostinger (Node.js app) deployment is in **`app/README-DEPLOY-NODE.md`**.

## Status

- **Backend / admin panel** — functional v1: auth (master + sub-user roles), property CRUD with
  image upload, status management, CSV bulk import, enquiries, user management, and the enquiry/OTP
  + public-listings APIs.
- **Public site** — design mockups in `design/`; not yet wired to the database. Next step is to
  serve them from the app and have them fetch `/api/listings`, with the enquiry form posting to
  `/api/enquiry` → `/api/verify-otp`.
- **OTP SMS** — needs an MSG91 (or Twilio) account + India DLT templates before it sends live.
