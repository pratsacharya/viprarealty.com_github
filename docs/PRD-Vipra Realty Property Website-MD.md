# PRD — Vipra Realty Property Website

_As of Nov 8, 2026_

Vipra Realty needs a professional, SEO-friendly real-estate consultancy website that lets the owner publish and manage rental and sale listings across residential and commercial, including resale and new-development projects, and lets property seekers browse them and enquire through an OTP-verified form or WhatsApp. It is a listing-and-enquiry site, not a marketplace: there are no online transactions, and all listings are controlled through a secure, role-based MySQL admin panel.

## Objectives & success metrics

Deliver a secure, professional, mobile-responsive web platform where Vipra Realty publishes its own property inventory and converts visitor interest into qualified, OTP-verified enquiries.

- **Showcase inventory** — present rental and sale listings — residential and commercial, including resale and new-development — with rich detail pages and images (up to 20 per property).
- **Capture verified leads** — every enquiry is confirmed by a 4-digit OTP before it reaches the team, cutting junk leads.
- **Give the owner full control** — a role-based admin panel manages listings, pricing and status (active / inactive / sold out / rented out) without developer involvement.
- **Support fast lead response** — enquiries notify the master mailbox instantly; WhatsApp click-to-chat is available on every page.
- **Be found** — SEO-friendly URLs and meta tags on all public pages.

Success looks like: the team can add, edit and retire listings unaided; seekers can find a property and submit a verified enquiry in under two minutes; and every enquiry lands in the master inbox with full context.

## Scope

This PRD covers the **web-only v1 release**: public website plus admin panel. It is a listing-and-enquiry site — not a marketplace. No payments, bookings or transactions happen online.

**In scope**

- Public pages: Home, Properties (listing grid + filters), Property detail, Contact Us, Privacy Policy.
- Property browsing by search type (Rent / Buy) and category (Residential / Commercial) with sub-categories, plus a free-text requirement search and a city filter in the search grid (Bangalore, Mumbai, Navi Mumbai, Thane).
- Property detail page with category-specific highlights, image gallery, enquiry and WhatsApp.
- OTP-verified enquiry form (name, mobile, requirement) with SMS confirmation to the seeker and email alert to the team.
- Floating WhatsApp click-to-chat widget (wa.me) on every page.
- EMI calculator.
- Admin panel with master and sub-user roles, listing CRUD, status management, and Excel bulk import.
- Basic reporting and analytics for admin.

**Out of scope (v1 — may be added later)**

- Native mobile apps (iOS / Android).
- AI-based property recommendations.
- Third-party property-data integration.
- Chatbot.
- Multi-language support.
- WhatsApp Business API (v1 uses simple click-to-chat links only).

## Users & roles

Three user types interact with the system. Only admin roles authenticate; seekers browse anonymously.

| Role | Access | Who | What they do |
| --- | --- | --- | --- |
| **Property seeker** | Public, no login | HNIs, NRIs, families, businesses | Browse listings, use EMI calculator, submit OTP-verified enquiries, chat on WhatsApp |
| **Master user** | `/admin`, email + password | Owner (24vipra@gmail.com) | Full control: listing CRUD, status changes, bulk import, create/delete sub-users, reporting |
| **Sub user** | `/admin`, email + temp password | Staff added by master | Read and **add** listings only — cannot set inactive / sold out / rented out; must change password on first login |

There is exactly **one master user** with full rights. The master creates sub-users by entering their email and a temporary password; the system emails the sub-user their temp password and the `/admin` link. Sub-users change their own password after first login, and the master can delete a sub-user at any time.

## Site map & information architecture

Four public pages, plus the gated admin panel at `/admin`.

1. **Home** — brand intro, featured / recent listings, search entry (type + category), EMI calculator teaser, company profile, bank-partner note, a brokerage fee structure, enquiry and WhatsApp.
2. **Properties** — listing grid filterable by search type (Rent / Buy), category (Residential / Commercial) and sub-category; each card links to a detail page.
    - **Property detail** — opens from a card: highlights by category, image gallery, **Enquire** button, WhatsApp button, and "other available properties of the same category" below.
3. **Contact Us** — phone +91 91085 98918, enquiry@viprarealty.com, office at 19 Ambalipura, Sarjapur Road, Bangalore 562125, enquiry form and WhatsApp.
4. **Privacy Policy** — data handling, OTP/SMS consent, cookies.

**`/admin`** (gated) — login, listings management (add / edit / status / images / pricing / history), Excel import, user management (master only), reporting.

Global elements on every page: logo (image only, no wordmark), primary nav, floating WhatsApp widget, footer with contact and privacy link.

## Public website — browsing & property detail

Anyone can view listings without logging in. Only **active** listings appear; inactive ones are hidden, and sold-out / rented-out ones show with that status badge.

**Search & discovery.** The search bar lets seekers filter by search type (Rent / Buy) and category / sub-category, and also type a free-text requirement (e.g. "3 BHK near Sarjapur under ₹50k") to surface the closest-matching and nearby listings — in the style of squareyards.com. A city filter in the Properties search grid (Bangalore, Mumbai, Navi Mumbai, Thane) scopes results to a city.

**Listing grid (Properties page).** Cards show image, title, price/rent/sale, location and category. Filters: search type, category, sub-category. Clicking a card opens the full detail page.

**Property detail page.** Shows the image gallery (up to 20 images), builder/project/building name, description, pricing fields relevant to the type, and category-specific highlights. Below the highlights: an **Enquire** button, a **WhatsApp** button, and a strip of other available properties in the same category.

Highlights shown depend on the property type:

| Category | Type | Highlight fields on detail page |
| --- | --- | --- |
| Residential | Flats | Bedroom, Bathroom, Square Ft / Carpet Area, Total Floors / floor the unit is on |
| Residential | Villas / Independent House | Bedroom, Bathroom, Plot Size / Built Area, Total Floors |
| Commercial | Office Space | Square Ft, Bathroom, Carpet Area, Total Floors / floor, Ceiling Height |
| Commercial | Retail Store | Square Ft, Bathroom, Carpet Area, Total Floors / floor, Ceiling Height |
| Commercial | Warehouse | Square Ft, Bathroom, Carpet Area, Total Floors / floor, Ceiling Height |

Every page is responsive and uses SEO-friendly URLs and meta tags.

## Enquiry, OTP & WhatsApp flow

Two ways to reach the team from any listing: a verified enquiry form, or WhatsApp.

**Enquiry form (OTP-verified)**

1. Seeker clicks **Enquire** on a property; a pop-up opens with three fields: Name, Mobile number, Requirement.
2. Mobile is mandatory and validated as exactly 10 numeric digits.
3. On submit, the system sends a **4-digit OTP** by SMS to that number; the seeker enters it to verify.
4. On successful verification, the enquiry is recorded and the seeker receives an SMS: "Thank you for your enquiry, we will get in touch with you — Vipra Realty."
5. The system emails the master mailbox that an enquiry was received, with the form details plus the property, date and time. A WhatsApp alert is also sent to the team on each enquiry.

**WhatsApp**

- Each listing has a **WhatsApp** button that opens the seeker's WhatsApp (via a `wa.me` link) pre-filled with a brief of the clicked property, addressed to **+91 91085 98918**.
- A **floating WhatsApp widget** appears on every page; clicking it opens a chat with the same number. This is simple click-to-chat — no WhatsApp Business API.

OTP delivery and the thank-you SMS go through an SMS gateway (e.g. MSG91 or Twilio); OTP attempts are logged for abuse control.

## EMI calculator & bank partners

A client-side EMI calculator lets seekers estimate a monthly premium. Inputs: loan amount, interest rate (annual %), and tenure entered in years or months, with a unit toggle to switch between the two. Output: the monthly EMI, updated live.

It uses the standard reducing-balance formula:

```
EMI = P · r · (1 + r)^n / ((1 + r)^n − 1)
```

where P is the principal, r the monthly interest rate (annual rate / 12 / 100), and n the tenure in months.

Alongside the calculator, a short note positions Vipra Realty as a loan facilitator: "We are channel partners with all major banks. Contact us for your loan requirement — hassle-free and speedy loan process." The calculator is informational only; it does not submit or store anything.

## Admin panel — roles, permissions & capabilities

The admin panel lives at `/admin` and authenticates with email + password. It can be a separate interface or the front-end extended with an admin role. The master password is set securely at first login / deployment, never stored in documentation.

Capabilities by role:

| Capability | Master | Sub user |
| --- | --- | --- |
| Add a new listing (manual) | Yes | Yes |
| Edit an existing listing | Yes | No |
| Set listing inactive / reactivate | Yes | No |
| Mark sold out | Yes | No |
| Mark rented out | Yes | No |
| Bulk import listings from Excel | Yes | No |
| Create / delete sub-users | Yes | No |
| Change own password | Yes | Yes (required on first login) |
| View reporting & analytics | Yes | No (master-only) |

**Status model.** Every listing has a status: **active** (visible), **inactive** (hidden from the site), **sold out** (shown with a Sold Out badge), or **rented out** (shown with a Rented Out badge). Only the master can change status.

**Excel bulk import (master only).** Upload an Excel file to add listings in bulk — mostly new properties — including a status field (active / inactive / sold out / rented out) per row. The importer validates rows, reports errors, and maps columns to the property fields below.

**Reporting & analytics.** Basic admin reporting (master-only): listing counts by status/category, enquiry trends over time, and top properties.

## Property data model

All fields below are controlled from the admin panel. Categories and sub-categories must be **extensible** — the master can add a new category or sub-category when needed.

**Search types:** Rent, Buy.

**Categories & sub-categories**

| Category | Sub-categories |
| --- | --- |
| Residential | Flats, Villas, Independent House, Independent Plots |
| Commercial | Office Space, Retail Store, Warehouse, Land, Others |

**Buy** has two listing types — **Resale** and **Under Construction project** — each covering both the **Residential** and **Commercial** categories. **Rent** has two options directly: **Residential** and **Commercial**.

Tree: Buy → Resale / Under Construction → Residential / Commercial; Rent → Residential / Commercial.

**Core listing fields** (per property)

| Field | Notes |
| --- | --- |
| Builder name | |
| Project title | |
| Building name | |
| Brief description | |
| Sale price | For sale listings |
| Monthly rent | Residential & commercial rentals |
| Deposit amount | |
| Down payment | |
| Possession date | Relevant for under-construction |
| Search type | Rent / Buy |
| Category / sub-category | From the lists above (extensible) |
| Status | Active / Inactive / Sold out / Rented out |
| Images | Up to 20 per listing |

**Type-specific highlight fields** (shown on the detail page) are listed in the Public website section above — bedrooms, bathrooms, area, floors, and ceiling height for commercial units.

## Integrations & notifications

| Channel | Purpose | Implementation |
| --- | --- | --- |
| SMS gateway | Send 4-digit OTP; send the thank-you SMS to the seeker | MSG91 or Twilio (sender ID + DLT template for India) |
| WhatsApp | Click-to-chat from listings and floating widget | `wa.me` links to +91 91085 98918, pre-filled property brief; no Business API |
| Email | Enquiry alert to the team | Enquiry details emailed to the master mailbox |
| Image storage | Store up to 20 images per listing | Local file storage in v1 (S3 / Cloudinary optional later) |

**Email routing (as configured by the client).** The Hostinger mailbox `support@viprarealty.com` is the real inbox; `enquiry@viprarealty.com` is an alias that auto-forwards to it. Both also copy `24vipra@gmail.com`. The team can send support mail from `24vipra@gmail.com`, but enquiry mail should originate from the Vipra Realty addresses. Enquiry notifications should target the master mailbox so they are not missed.

OTP logs (number, timestamp, verification result) are retained for abuse detection and rate-limiting.

## Design & branding

Clean, professional and trustworthy — the look should reassure HNIs, NRIs and businesses. Design reference: urbanedgespaces.com for layout and polish.

- **Logo** — use the logo image (`logo-viprarealty1-selected.png`) wherever the company name would appear; do not render the name as text.
- **Colours** — black body text on white backgrounds; use the brand colours drawn from the logo (a purple and a teal) as accents for buttons, highlights and headings.
- **Tone** — professional, uncluttered, image-forward. Property photography leads; generous whitespace.
- **Responsive** — mobile-first; the grid, detail page, enquiry pop-up and WhatsApp widget all work on phones.

Deliverables for this phase include wireframes and mockups for the homepage, listing grid, property detail page, and the admin listings-management screens.

## System architecture

A React front-end calls a REST API, which owns all data in MySQL and local image storage and talks to the SMS gateway and email. WhatsApp is reached directly from the browser via a wa.me link, bypassing the backend.

- **Clients** — property seeker (web) and the admin panel at `/admin`.
- **Frontend** — React SPA (responsive, SEO-friendly URLs and meta tags).
- **Backend** — REST API (Node/Express or Laravel): Auth (JWT/session), Property CRUD, OTP verify, Enquiry capture, Excel bulk import, logging.
- **Data** — MySQL database and local image storage.
- **External services** — SMS gateway (MSG91 / Twilio) for OTP and thank-you SMS; Email to the master mailbox; WhatsApp via wa.me (client-side).

## Technology stack & database

| Layer | Choice | Notes |
| --- | --- | --- |
| Frontend | React | Responsive SPA built from the mockups; SEO-friendly URLs + meta tags |
| Backend | Node.js/Express or PHP Laravel | RESTful APIs; final choice at team's discretion |
| Database | MySQL / MariaDB | Primary data store |
| Auth | JWT or session-based | Email + password for admin; first-login password change for sub-users |
| Image storage | Local filesystem (v1) | S3 / Cloudinary optional later |
| SMS | MSG91 / Twilio | OTP + thank-you SMS |
| Repo / hosting | GitHub, Hostinger shared hosting | SSL on the production domain |

**Key data entities (MySQL)**

| Entity | Holds |
| --- | --- |
| `users` | Admin accounts: email, password hash, role (master / sub), active flag |
| `categories` / `sub_categories` | Extensible category tree |
| `properties` | All listing fields, category/sub-category refs, search type, status, pricing |
| `property_images` | Up to 20 images per property, ordered |
| `enquiries` | Name, mobile, requirement, property ref, timestamp, OTP-verified flag |
| `otp_logs` | Mobile, OTP, issued/verified timestamps, result |
| `import_batches` | Excel import runs, row counts, errors |

**Backend API surface** (REST): sub-user management (register/login/profile/password), property CRUD with image handling, OTP generation and verification, enquiry capture, and bulk import. Authentication is enforced on all admin endpoints, with logging and monitoring.

## Non-functional requirements

- **Security** — hashed passwords, role-based access control, enforced first-login password change for sub-users, OTP rate-limiting, input validation, HTTPS/SSL everywhere, protection against common web attacks (SQLi, XSS, CSRF).
- **Scalability** — clean schema and REST APIs that can grow with inventory; image storage swappable to a CDN later without a rewrite.
- **Performance** — fast listing grid and detail pages; optimised/compressed images; lazy-loaded galleries.
- **SEO** — SEO-friendly URLs, meta tags and semantic markup on all public pages.
- **Reliability** — automated backups of database and images; monitoring and logging; a final sanity check before go-live.
- **Privacy & consent** — clear Privacy Policy; seeker consent for SMS; OTP and enquiry data retained only as needed.
- **Maintainability** — source in GitHub; API documentation; code structured so the owner's team can brief future enhancements.

## Deliverables, milestones & launch plan

Phased delivery, each phase ending in concrete artifacts.

| Phase | Work | Deliverables |
| --- | --- | --- |
| 1. Requirements | Finalise this PRD, plan, backlog | Requirements spec, project plan, sprint backlog |
| 2. Design | Wireframes & mockups (home, grid, detail, admin); architecture; DB schema; API contracts | UI/UX assets, architecture doc, DB schema, API spec |
| 3. Frontend | React setup, responsive public pages, submission form (≤ 20 images), 4-digit OTP flow, SEO | Working front-end on staging |
| 4. Backend | Server setup, REST APIs (users, property CRUD, OTP, enquiry), auth, SMS integration, logging | APIs + documentation |
| 5. Database & storage | MySQL setup, local image storage | Functional staging site, source repo, API docs |
| 6. Deployment | Hostinger production, domain + SSL, deploy app & DB, backups, sanity check, go live | Live website, deployment docs |
| 7. Post-launch | Monitor, fix critical bugs, collect feedback, plan v2 | Support logs, feature-request list |

**Future scope (v2 candidates):** advanced search, subscription plans, and the items listed as out of scope above.

## Decisions & assumptions

Confirmed with the client (assumptions noted where still open):

- **OTP length** — confirmed: a **4-digit** OTP.
- **Sub-user reporting** — confirmed: reporting & analytics are **master-only**; sub-users see none.
- **Enquiry alerts** — confirmed: on each enquiry the team gets an **email to the master mailbox and a WhatsApp alert**.
- **Featured listings on Home** — confirmed: **most recent + a master "featured" flag** on a listing.
- **Excel import template** — provided: a template with all property header fields (builder, project, search type, listing type, category, sub-category, city, pricing, area, status, images, featured).
- **Backend framework** — Node.js/Express or PHP Laravel, chosen by the dev team (Hostinger shared hosting may favour PHP).
- **Brokerage info** — confirmed: the brokerage fee structure is **published on the Home page**.
- **Analytics depth** — confirmed: basic reporting = **listing counts, enquiry trends, and top properties**.
