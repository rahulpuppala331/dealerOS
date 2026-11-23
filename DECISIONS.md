# Architectural & Reconciliation Decisions

## Decision: compare System B's value against System A's total_value
- Rejected: compare against System A's `base_value`
- Why: On every clean matched row in the datasets, System B records `total_value` (`base_value + adjustment`). The three rows where B equals `base_value` (`REC-1003`, `REC-1027`, `REC-1088`) are genuine missing-adjustment discrepancies and must be flagged as `VALUE_MISMATCH`.

## Decision: store monetary amounts as exact integer minor units (cents) in SQLite
- Rejected: store amounts as SQLite `REAL` / JavaScript `number` floating-point values
- Why: IEEE-754 floats cannot represent base-10 decimals accurately (`0.1 + 0.2 !== 0.3`). Storing exact integer cents guarantees lossless equality checks and exact split summation (`71950.93 + 107926.39 = 179877.32`).

## Decision: preserve blank and unparseable values as NULL, never 0
- Rejected: default blank values to `0.00` or drop dirty rows during import
- Why: `ENT/2026/4050` has a blank value and `REC-1050` has a blank `actor_id`. Blank means unknown, not zero. Keeping every CSV row (`120/120` in A, `121/121` in B) with raw text columns alongside nullable parsed columns ensures zero data loss and renders missing amounts as empty cells in the UI.

## Decision: normalize messy System B record references on import while storing `record_ref_raw`
- Rejected: join System B to System A using exact raw string equality
- Why: System B contains `"rec1034"`, `" REC - 1070 "`, and `"1112"`, all of which refer to valid System A records (`REC-1034`, `REC-1070`, `REC-1112`). Extracting the numeric identifier into canonical `REC-<digits>` eliminates false orphans/misses while preserving raw text for auditing.

## Decision: omit a foreign key from `system_b_entries.record_ref` to `system_a_records.record_id`
- Rejected: enforce a relational foreign key constraint between System B and System A
- Why: `ENT/2026/4901` references `REC-1999`, which does not exist in System A. A foreign key would reject the orphan row during ingestion instead of allowing us to persist and flag it as `ORPHAN_IN_B`.

## Decision: treat multiple System B entries that sum exactly to `A.total_value` as a valid split
- Rejected: flag every record with more than one System B entry as `DUPLICATE_IN_B`
- Why: `REC-1055` has two entries (`ENT/2026/4055` for `71950.93` and `ENT/2026/4903` for `107926.39`, labeled `"Entry part 2 of 2"`) that sum exactly to `179877.32`. By contrast, `REC-1042` posts `112837.06` twice (`225674.12` total) and is flagged as `DUPLICATE_IN_B`.

## Decision: flag `VOIDED` System A records that still carry an active System B entry
- Rejected: ignore `VOIDED` records or treat an active B entry as expected
- Why: `REC-1019` has `state = VOIDED` in System A while `ENT/2026/4019` still posts `57092.35` in System B. An unreversed posting in System B overstates the ledger, so we flag it explicitly as `VOIDED_IN_A` (whereas a voided A record with no B entry would reconcile cleanly).

## Decision: include `LOCATION_MISMATCH` and `DATE_MISMATCH` in addition to the four core reasons
- Rejected: only flag missing, orphan, duplicate, and value mismatches
- Why: `REC-1009` crosses a month-end boundary (`2026-03-31` in A vs `2026-04-02` in B), which affects period-close reporting, and `REC-1077` is booked to the wrong branch/tenant. Both are real operational discrepancies worth surfacing.

## Decision: enforce tenant isolation inside SQL via `locations.org_id` and redact foreign locations on cross-org mismatches
- Rejected: filter by org in React, infer org from `LOC-1xx`/`LOC-2xx` prefixes, or expose both locations on `REC-1077`
- Why: `REC-1077` is recorded at `LOC-102` (`ORG-A`) in System A and `LOC-201` (`ORG-B`) in System B. Revealing `LOC-201` to `ORG-A` leaks `ORG-B` metadata, and showing `REC-1077` to `ORG-B` leaks `ORG-A` data. Our SQL repository joins through `locations.org_id`, returns `REC-1077` only to its authoritative System A owner (`ORG-A`), and redacts System B's foreign location ID completely from the JSON payload.
