-- ===========================================================================
-- Upgrade: brute-force protection for the handover code.
--
-- Run on a project that already has the schema. Idempotent.
-- Needed by the unit kiosk screen at /robot/<unit-id>.
-- ===========================================================================

alter table orders
  add column if not exists handover_attempts integer not null default 0,
  add column if not exists handover_locked_at timestamptz;
