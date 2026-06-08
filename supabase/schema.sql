-- =====================================================================
--  Trendholic Wholesale — Supabase database schema
--  Run this whole file once in:  Supabase Dashboard → SQL Editor → New query
--  It creates the tables, security rules (RLS), triggers and sample data.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. PROFILES  (one row per customer / staff account)
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  shop_name       text,                            -- company / business name
  contact_name    text,
  phone           text,
  company_address text,                            -- full reseller application fields ↓
  payable_contact text,
  bank_details    text,
  resale_cert_path text,                           -- path in private "reseller-docs" bucket
  state_id_path   text,                            -- path in private "reseller-docs" bucket
  discount_pct numeric  not null default 0  check (discount_pct >= 0 and discount_pct <= 100),
  approved     boolean  not null default false,   -- must be TRUE to see prices / order
  is_admin     boolean  not null default false,   -- store owner / staff
  created_at   timestamptz not null default now()
);
-- if you already created the profiles table before, add the new columns:
alter table public.profiles add column if not exists company_address  text;
alter table public.profiles add column if not exists payable_contact  text;
alter table public.profiles add column if not exists bank_details     text;
alter table public.profiles add column if not exists resale_cert_path text;
alter table public.profiles add column if not exists state_id_path    text;

-- ---------------------------------------------------------------------
-- 2. PRODUCTS  (the wholesale catalog with prices)
-- ---------------------------------------------------------------------
create table if not exists public.products (
  id          uuid primary key default gen_random_uuid(),
  name        text    not null,
  description text,                                 -- short blurb shown on the card
  image_url   text,                                 -- product photo (Supabase Storage)
  category    text    not null default 'General',
  unit        text    not null default 'unit',      -- e.g. "Case (4 x 10 lb)"
  price       numeric not null check (price >= 0),   -- wholesale price per unit
  moq         integer not null default 1 check (moq >= 1),  -- minimum order quantity
  sort        integer not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
-- if you already created the products table before, add the new columns:
alter table public.products add column if not exists description text;
alter table public.products add column if not exists image_url   text;

-- ---------------------------------------------------------------------
-- 3. ORDERS  (one row per placed order; line items stored as JSON)
-- ---------------------------------------------------------------------
create table if not exists public.orders (
  id              uuid primary key default gen_random_uuid(),
  order_no        bigint generated always as identity,
  user_id         uuid not null references auth.users(id) on delete cascade,
  items           jsonb   not null,               -- [{product_id, name, unit, qty, price}]
  subtotal        numeric not null default 0,
  discount_pct    numeric not null default 0,
  discount_amount numeric not null default 0,
  tax_rate        numeric not null default 0,
  tax_amount      numeric not null default 0,
  total           numeric not null default 0,
  note            text,
  status          text    not null default 'new', -- new | confirmed | fulfilled | cancelled
  created_at      timestamptz not null default now()
);

-- =====================================================================
--  HELPER FUNCTIONS  (SECURITY DEFINER avoids RLS recursion on profiles)
-- =====================================================================
create or replace function public.is_admin()
returns boolean language sql security definer stable
set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.is_approved()
returns boolean language sql security definer stable
set search_path = public as $$
  select coalesce((select approved from public.profiles where id = auth.uid()), false);
$$;

-- Create a profile row automatically whenever someone signs up.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  insert into public.profiles (
    id, shop_name, contact_name, phone,
    company_address, payable_contact, bank_details,
    resale_cert_path, state_id_path
  )
  values (
    new.id,
    new.raw_user_meta_data->>'shop_name',
    new.raw_user_meta_data->>'contact_name',
    new.raw_user_meta_data->>'phone',
    new.raw_user_meta_data->>'company_address',
    new.raw_user_meta_data->>'payable_contact',
    new.raw_user_meta_data->>'bank_details',
    new.raw_user_meta_data->>'resale_cert_path',
    new.raw_user_meta_data->>'state_id_path'
  )
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Stop customers from approving themselves or making themselves admin.
-- Only an admin may change approved / is_admin / discount_pct.
create or replace function public.protect_profile_columns()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  -- Only block a logged-in NON-admin web user from changing these fields.
  -- Allow changes from the SQL editor / service role (auth.uid() is null)
  -- and from admins, so the owner can be bootstrapped and manage customers.
  if auth.uid() is not null and not public.is_admin() then
    new.approved     := old.approved;
    new.is_admin     := old.is_admin;
    new.discount_pct := old.discount_pct;
  end if;
  return new;
end; $$;

drop trigger if exists protect_profile on public.profiles;
create trigger protect_profile
  before update on public.profiles
  for each row execute function public.protect_profile_columns();

-- Recompute order money fields on the SERVER from real product prices,
-- so a customer can never tamper with prices/totals from the browser.
create or replace function public.finalize_order()
returns trigger language plpgsql security definer
set search_path = public as $$
declare
  it       jsonb;
  pid      uuid;
  q        numeric;
  p        numeric;
  sub      numeric := 0;
  drate    numeric := 0;
begin
  if new.items is null or jsonb_array_length(new.items) = 0 then
    raise exception 'Order has no items';
  end if;

  for it in select * from jsonb_array_elements(new.items) loop
    pid := (it->>'product_id')::uuid;
    q   := coalesce((it->>'qty')::numeric, 0);
    if q <= 0 then raise exception 'Invalid quantity for product %', pid; end if;
    select price into p from public.products where id = pid and active = true;
    if p is null then raise exception 'Unknown or inactive product %', pid; end if;
    sub := sub + (p * q);
  end loop;

  select coalesce(discount_pct, 0) into drate from public.profiles where id = new.user_id;

  new.subtotal        := round(sub, 2);
  new.discount_pct    := drate;
  new.discount_amount := round(sub * drate / 100.0, 2);
  -- tax_rate is supplied by the client from config; clamp to a sane range
  if new.tax_rate is null or new.tax_rate < 0 then new.tax_rate := 0; end if;
  new.tax_amount      := round((new.subtotal - new.discount_amount) * new.tax_rate / 100.0, 2);
  new.total           := new.subtotal - new.discount_amount + new.tax_amount;
  new.status          := 'new';
  return new;
end; $$;

drop trigger if exists finalize_order_trg on public.orders;
create trigger finalize_order_trg
  before insert on public.orders
  for each row execute function public.finalize_order();

-- =====================================================================
--  ROW LEVEL SECURITY  (this is what hides prices from outsiders)
-- =====================================================================
alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.orders   enable row level security;

-- ---- profiles ----
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (id = auth.uid());

drop policy if exists profiles_admin_all on public.profiles;
create policy profiles_admin_all on public.profiles
  for all using (public.is_admin()) with check (public.is_admin());

-- ---- products ----  (PRICES: only approved, logged-in customers can read)
drop policy if exists products_select on public.products;
create policy products_select on public.products
  for select using (public.is_approved());

drop policy if exists products_admin_all on public.products;
create policy products_admin_all on public.products
  for all using (public.is_admin()) with check (public.is_admin());

-- ---- orders ----
drop policy if exists orders_insert_own on public.orders;
create policy orders_insert_own on public.orders
  for insert with check (user_id = auth.uid() and public.is_approved());

drop policy if exists orders_select on public.orders;
create policy orders_select on public.orders
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists orders_admin_update on public.orders;
create policy orders_admin_update on public.orders
  for update using (public.is_admin()) with check (public.is_admin());

-- =====================================================================
--  PRODUCT IMAGE STORAGE
--  A public bucket for product photos. Anyone can VIEW the images
--  (they are not price data); only admins can upload/replace/delete.
-- =====================================================================
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

drop policy if exists product_images_read   on storage.objects;
drop policy if exists product_images_insert on storage.objects;
drop policy if exists product_images_update on storage.objects;
drop policy if exists product_images_delete on storage.objects;

create policy product_images_read on storage.objects
  for select using (bucket_id = 'product-images');
create policy product_images_insert on storage.objects
  for insert with check (bucket_id = 'product-images' and public.is_admin());
create policy product_images_update on storage.objects
  for update using (bucket_id = 'product-images' and public.is_admin());
create policy product_images_delete on storage.objects
  for delete using (bucket_id = 'product-images' and public.is_admin());

-- =====================================================================
--  RESELLER DOCUMENT STORAGE  (PRIVATE)
--  Holds resale certificates and state IDs uploaded during the reseller
--  application. The bucket is PRIVATE: applicants upload with the anon key
--  during signup (before any session exists), but only admins can read or
--  manage the files, keeping sensitive documents confidential.
-- =====================================================================
insert into storage.buckets (id, name, public)
values ('reseller-docs', 'reseller-docs', false)
on conflict (id) do nothing;

drop policy if exists reseller_docs_insert on storage.objects;
drop policy if exists reseller_docs_read   on storage.objects;
drop policy if exists reseller_docs_update on storage.objects;
drop policy if exists reseller_docs_delete on storage.objects;

-- Anyone (incl. anon, pre-signup) may upload an application document.
create policy reseller_docs_insert on storage.objects
  for insert with check (bucket_id = 'reseller-docs');
-- Only admins may view / manage the uploaded documents.
create policy reseller_docs_read on storage.objects
  for select using (bucket_id = 'reseller-docs' and public.is_admin());
create policy reseller_docs_update on storage.objects
  for update using (bucket_id = 'reseller-docs' and public.is_admin());
create policy reseller_docs_delete on storage.objects
  for delete using (bucket_id = 'reseller-docs' and public.is_admin());

-- =====================================================================
--  SAMPLE PRODUCTS  (edit / delete these from the Admin page later)
-- =====================================================================
insert into public.products (name, description, image_url, category, unit, price, moq, sort) values
  ('Bahar Sella Rice 10LB x 4',    'Premium quality sella rice, perfect for every kitchen.', 'images/bahar-sella.jpg',     'Rice', 'Case (4 x 10 lb)', 48, 1, 10),
  ('Falak Extreme Rice x 4',       'Extra long grain rice for rich taste and aroma.',        'images/falak.jpg',           'Rice', 'Case (x4)',        48, 1, 20),
  ('M-Meraj Sella Rice 10LB x 4',  'High quality sella rice for fluffy, delicious meals.',   'images/meraj.jpg',           'Rice', 'Case (4 x 10 lb)', 40, 1, 30),
  ('Ujala Basmati Rice 10LB x 4',  'Aromatic basmati rice with extra long grains.',          'images/ujala.jpg',           'Rice', 'Case (4 x 10 lb)', 40, 1, 40),
  ('Aahubarah Sella Rice 10LB x 4','Quality sella rice for everyday cooking.',               'images/aahubarah-sella.jpg', 'Rice', 'Case (4 x 10 lb)', 62, 1, 50),
  ('Aahubarah Organic Rice 10LB x 4','100% organic rice, healthy and natural.',              'images/aahubarah-organic.jpg','Rice', 'Case (4 x 10 lb)', 62, 1, 60),
  ('Mother Sella Rice 10LB x 4',   'Trusted quality sella rice for every family.',           'images/mother.jpg',          'Rice', 'Case (4 x 10 lb)', 64, 1, 70),
  ('Baghlan Sella Rice 10LB x 4',  'Premium rice from the finest fields.',                   'images/baghlan.jpg',         'Rice', 'Case (4 x 10 lb)', 62, 1, 80),
  ('Bahar Basmati 10LB x 4',       'Aromatic basmati rice for special occasions.',           'images/bahar-basmati.jpg',   'Rice', 'Case (4 x 10 lb)', 42, 1, 90),
  ('Kabuli Sella Rice 10LB x 4',   'High quality sella rice for delicious meals.',           'images/kabuli.jpg',          'Rice', 'Case (4 x 10 lb)', 52, 1, 100)
on conflict do nothing;

-- =====================================================================
--  AFTER you sign up the FIRST time with your owner email, run this to
--  make yourself the admin (replace the email):
--
--    update public.profiles set is_admin = true, approved = true
--    where id = (select id from auth.users where email = 'you@example.com');
-- =====================================================================
