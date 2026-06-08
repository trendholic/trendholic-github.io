-- =====================================================================
--  MIGRATION — Per-invoice (partial) payments
--  Links a payment to a specific order so an invoice can be paid in parts.
--  A payment with order_id = NULL is still a general account credit.
--  Idempotent; safe to run more than once.
-- =====================================================================
alter table public.payments
  add column if not exists order_id uuid references public.orders(id) on delete set null;

create index if not exists payments_order_idx on public.payments(order_id);
