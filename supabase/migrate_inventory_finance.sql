-- =====================================================================
--  MIGRATION — Inventory, Online Payments, Profit/Loss & Client Ledgers
--  Run this ONCE in: Supabase Dashboard → SQL Editor → New query → Run.
--  It is idempotent (safe to run more than once) and only adds the pieces
--  introduced after the original reseller-application setup.
-- =====================================================================

-- 1) PRODUCTS: inventory + cost (for profit/loss) ----------------------
alter table public.products add column if not exists stock integer;                       -- NULL = untracked
alter table public.products add column if not exists cost  numeric not null default 0;     -- purchase cost / unit

-- 2) ORDERS: payment tracking + COGS / profit snapshot -----------------
alter table public.orders add column if not exists payment_status text not null default 'unpaid';
alter table public.orders add column if not exists paid_at        timestamptz;
alter table public.orders add column if not exists cost_total     numeric not null default 0;
alter table public.orders add column if not exists profit         numeric not null default 0;

-- 3) PAYMENTS: client ledger credits ----------------------------------
create table if not exists public.payments (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  amount      numeric not null check (amount > 0),
  method      text,
  note        text,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now()
);
create index if not exists payments_user_idx on public.payments(user_id);
alter table public.payments enable row level security;

drop policy if exists payments_admin_all on public.payments;
create policy payments_admin_all on public.payments
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists payments_select_own on public.payments;
create policy payments_select_own on public.payments
  for select using (user_id = auth.uid() or public.is_admin());

-- 4) finalize_order(): enforce + decrement stock, snapshot COGS/profit -
create or replace function public.finalize_order()
returns trigger language plpgsql security definer
set search_path = public as $$
declare
  it       jsonb;
  pid      uuid;
  q        numeric;
  p        numeric;
  c        numeric;
  st       integer;
  pname    text;
  sub      numeric := 0;
  csum     numeric := 0;
  drate    numeric := 0;
begin
  if new.items is null or jsonb_array_length(new.items) = 0 then
    raise exception 'Order has no items';
  end if;

  for it in select * from jsonb_array_elements(new.items) loop
    pid := (it->>'product_id')::uuid;
    q   := coalesce((it->>'qty')::numeric, 0);
    if q <= 0 then raise exception 'Invalid quantity for product %', pid; end if;
    select price, cost, stock, name into p, c, st, pname
      from public.products where id = pid and active = true for update;
    if p is null then raise exception 'Unknown or inactive product %', pid; end if;
    if st is not null and q > st then
      raise exception 'Not enough stock for "%": % left, % requested', pname, st, q;
    end if;
    sub  := sub  + (p * q);
    csum := csum + (coalesce(c, 0) * q);
  end loop;

  for it in select * from jsonb_array_elements(new.items) loop
    pid := (it->>'product_id')::uuid;
    q   := coalesce((it->>'qty')::numeric, 0);
    update public.products set stock = stock - q where id = pid and stock is not null;
  end loop;

  select coalesce(discount_pct, 0) into drate from public.profiles where id = new.user_id;

  new.subtotal        := round(sub, 2);
  new.discount_pct    := drate;
  new.discount_amount := round(sub * drate / 100.0, 2);
  if new.tax_rate is null or new.tax_rate < 0 then new.tax_rate := 0; end if;
  new.tax_amount      := round((new.subtotal - new.discount_amount) * new.tax_rate / 100.0, 2);
  new.total           := new.subtotal - new.discount_amount + new.tax_amount;
  new.cost_total      := round(csum, 2);
  new.profit          := round((new.subtotal - new.discount_amount) - new.cost_total, 2);
  new.status          := 'new';
  return new;
end; $$;

drop trigger if exists finalize_order_trg on public.orders;
create trigger finalize_order_trg
  before insert on public.orders
  for each row execute function public.finalize_order();

-- 5) stamp_payment(): auto-stamp paid_at when payment_status changes ---
create or replace function public.stamp_payment()
returns trigger language plpgsql
set search_path = public as $$
begin
  if new.payment_status = 'paid' and coalesce(old.payment_status,'') <> 'paid' then
    new.paid_at := now();
  elsif new.payment_status <> 'paid' then
    new.paid_at := null;
  end if;
  return new;
end; $$;

drop trigger if exists stamp_payment_trg on public.orders;
create trigger stamp_payment_trg
  before update on public.orders
  for each row execute function public.stamp_payment();

-- Done. Refresh the admin page and stock / payments / P&L will work.
