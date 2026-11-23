# DealerOS — Multi-Tenant Ledger Reconciliation

A full-stack reconciliation application that ingests System A and System B ledger CSVs into SQLite without data loss, compares every record using exact integer-cent arithmetic, and surfaces tenant-isolated disagreements in a filterable, sortable table.

## Stack Choice

Built with **TypeScript + Express + SQLite (`better-sqlite3`) + React (Vite) + Vitest**.  
While the reference guide suggests Django + React, it explicitly permits any stack the developer is strongest in when documented here. Using TypeScript end-to-end allows strict shared types between the pure comparison engine, SQLite repository, Express API, and React UI, with zero external database setup required.

## How to Run (Clean Clone)

```bash
# 1. Install dependencies
npm install

# 2. Run the idempotent CSV importer into SQLite (prints read/saved audit counts)
npm run import

# 3. Run the automated test suite (comparison rules + strict tenant isolation)
npm test

# 4. Start the full-stack server (Express API + React UI on port 3000)
npm run dev
```

Open `http://localhost:3000` in your browser.

To run a production build:

```bash
npm run build
NODE_ENV=production npm start
```

## What Was Built

- **Idempotent Zero-Loss CSV Importer (`src/reconcile/importer.ts`, `scripts/import-data.ts`)**: Persists every row from `locations`, `system_a` (`120/120`), and `system_b` (`121/121`) via SQLite UPSERT inside a transaction. Preserves raw values (`record_ref_raw`, `value_raw`), normalizes messy refs (`rec1034`, ` REC - 1070 `, `1112`), parses Indian comma formatting (`1,25,400.00`), and stores blank fields strictly as `NULL` (never `0`).
- **Pure Comparison Engine (`src/reconcile/compare.ts`)**: Zero DB or HTTP dependencies. Detects `VALUE_MISMATCH`, `MISSING_IN_B`, `ORPHAN_IN_B`, `DUPLICATE_IN_B`, `LOCATION_MISMATCH`, `DATE_MISMATCH`, and `VOIDED_IN_A` while allowing valid split entries (`REC-1055`) and normalized references to pass cleanly.
- **SQL-Enforced Multi-Tenant API (`src/reconcile/service.ts`, `src/reconcile/app.ts`)**: Exposes `GET /api/disagreements?org=ORG-A&reason=...&sort=...`, `GET /api/summary?org=...`, `GET /api/orgs`, `GET /api/import-report`, and `POST /api/reimport`. All tenant scoping runs inside SQL joins through `locations.org_id`, and cross-org trap row `REC-1077` redacts System B's foreign location from `ORG-A`'s payload while excluding `REC-1077` from `ORG-B`.
- **Reconciliation Console (`src/App.tsx`, `src/components/`)**: Org switcher sending `?org=` to the API, tenant KPI summary strip, reason dropdown, sortable monetary columns, empty cells for missing/null values, expandable row details, live Import Audit tab, and Decisions tab.
- **Automated Tests (`tests/reconcile.test.ts`, `tests/tenant-isolation.test.ts`)**: Unit tests for every disagreement rule and non-error edge case, plus HTTP integration tests verifying zero cross-tenant leakage in serialized JSON responses for both `ORG-A` and `ORG-B`.

## What Was Deliberately Not Built

- **User authentication / RBAC login flow**: Out of scope for the timebox; tenant context is passed explicitly via `?org=` so reviewers can verify tenant isolation directly via UI and API tests.
- **Pagination**: Each tenant currently has under 10 disagreements (`7` in `ORG-A`, `5` in `ORG-B`), so cursor pagination adds unnecessary complexity without operational value at this scale.
- **Docker / cloud deployment manifests**: Local SQLite runs cleanly with a single `npm install && npm run dev`.
- **Manual resolution workflow / write-back edits**: Focus stayed strictly on accurate read-only detection, data hygiene, and tenant safety.

## How I Worked With the AI Agent

1. First audited all three CSV files directly with a row-counting and anomaly-inspection script to establish ground truth (`5` locations, `120` System A rows, `121` System B rows, and every deliberate anomaly) before designing the schema.
2. Kept the core logic cleanly separated into small, single-responsibility modules (`cleaning.ts`, `db.ts`, `importer.ts`, `compare.ts`, `service.ts`) so every function can be read and verified independently.
3. Verified every assumption against the real files using automated Vitest unit and HTTP integration tests, including string-level tenant leak assertions across serialized JSON payloads.

## Reflection Questions

### a. One thing the AI agent got wrong. How did you notice?
When checking multi-entry records and cross-org records, a naive comparison implementation either flags every multi-entry group as a duplicate or queries `system_b_entries` for an org by filtering solely on `b.location_id`, which accidentally treats `ENT/2026/4077` (at `LOC-201`, belonging to `ORG-B`) as an `ORPHAN_IN_B` for `ORG-B` and leaks `ORG-A`'s record reference `REC-1077` into `ORG-B`'s response. Inspecting the real CSV rows and writing the two-way tenant isolation test caught this immediately, leading to the `NOT EXISTS (SELECT 1 FROM system_a_records a WHERE a.record_id = b.record_ref)` guard on orphan queries and redacting foreign locations in `compareRecords`.

### b. The part you are least confident about, and why
The operational handling of cross-org misbookings (`REC-1077`, booked at `LOC-102` in System A and `LOC-201` in System B) and `VOIDED` records (`REC-1019`). Right now, `ORG-A` sees the `LOCATION_MISMATCH` with System B's foreign location redacted, while `ORG-B` sees nothing for `ENT/2026/4077` so `ORG-A`'s record ID is never exposed. In a real multi-tenant accounting platform, an internal DealerOS platform-ops queue (or an anonymized "unmatched external posting" alert for `ORG-B` that strips `REC-1077`) might also be needed so `ORG-B`'s branch ledger is not silently overstated by `83,361.40`.

### c. If you had a second day, what would you fix first?
First, I would replace the `?org=` query parameter with authenticated tenant context derived from a signed session/JWT middleware and add PostgreSQL Row-Level Security (RLS) policies, so a caller can never tamper with the org parameter. Second, I would add a dedicated internal ops queue for cross-org misbookings (`REC-1077`) and support incremental CSV uploads with per-run diff history.
