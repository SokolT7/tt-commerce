-- ============================================================================
-- Brute-force protection for the handover code.
--
-- The robot screen is a kiosk with no login: the four-digit code is the only
-- thing standing between a passer-by and the contents of the compartment.
-- Four digits is 10,000 combinations, which is nothing to try by hand at a
-- machine that gives unlimited attempts.
--
-- Failed attempts are counted and the code locks out, after which a member of
-- staff has to release it.
-- ============================================================================

alter table orders
  add column if not exists handover_attempts integer not null default 0,
  add column if not exists handover_locked_at timestamptz;

comment on column orders.handover_attempts is
  'Consecutive wrong codes entered at the unit. Reset on success.';
comment on column orders.handover_locked_at is
  'Set when too many wrong codes were entered; staff must release it.';
