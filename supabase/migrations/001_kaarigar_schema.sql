-- Kaarigar Production Schema for Supabase (PostgreSQL + PostGIS + Strict Auth RLS)
-- Covers: Geolocation privacy masking, radius matching, strict per-user isolation, orders, chat, photo reviews & Trust Score

create extension if not exists postgis;
create extension if not exists pgcrypto;

-- 1. Kaarigars (Strictly 1-to-1 bound to auth.users so one provider can NEVER access another's shop)
create table if not exists public.kaarigars (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique not null references auth.users(id) on delete cascade,
  business_name text not null,
  owner_name text not null,
  phone text not null, -- Protected: never returned by public discovery RPC
  emoji text not null default '🍱',
  theme_color text not null default '#FBD3E3',
  area_name text not null default 'Navrangpura, Ahmedabad',
  private_location geography(Point, 4326) not null, -- Exact home pin (Protected)
  masked_lat double precision not null,             -- Public ~350m offset pin
  masked_lng double precision not null,
  service_radius_km numeric(4,1) not null default 5.0,
  open_time text not null default '08:00',
  close_time text not null default '20:00',
  is_open boolean not null default true,
  daily_cap integer not null default 15,
  id_verified boolean not null default false,
  rating numeric(3,2) not null default 5.0,
  review_count integer not null default 0,
  trust_score integer not null default 72,
  created_at timestamptz not null default now()
);

create index if not exists kaarigars_geo_idx on public.kaarigars using gist (private_location);

-- 2. Services & Prices offered by each Kaarigar
create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  kaarigar_id uuid not null references public.kaarigars(id) on delete cascade,
  title text not null,
  price_inr integer not null check (price_inr > 0),
  sort_order integer not null default 0
);

-- 3. Work Portfolio Photos
create table if not exists public.kaarigar_photos (
  id uuid primary key default gen_random_uuid(),
  kaarigar_id uuid not null references public.kaarigars(id) on delete cascade,
  url text not null,
  created_at timestamptz not null default now()
);

-- 4. Orders (Bound to customer_id AND kaarigar_id)
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id) on delete cascade,
  kaarigar_id uuid not null references public.kaarigars(id) on delete cascade,
  service_id uuid references public.services(id) on delete set null,
  service_title text not null,
  unit_price integer not null,
  quantity integer not null check (quantity between 1 and 20),
  total_inr integer not null,
  commission_inr integer not null,
  net_payout_inr integer not null,
  fulfilment_type text not null default 'pickup' check (fulfilment_type in ('pickup', 'delivery')),
  payment_method text not null default 'upi' check (payment_method in ('upi', 'cod')),
  customer_name text not null default 'Neighbour',
  customer_note text not null default '',
  status text not null default 'placed' check (status in ('placed', 'accepted', 'ready', 'completed', 'cancelled')),
  created_at timestamptz not null default now()
);

-- 5. Order-Scoped In-App Chat Messages
create table if not exists public.order_messages (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  sender text not null check (sender in ('customer', 'kaarigar')),
  body text not null,
  created_at timestamptz not null default now()
);

-- 6. Post-Order Photo Reviews
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  order_id uuid unique references public.orders(id) on delete cascade,
  customer_id uuid not null references auth.users(id) on delete cascade,
  kaarigar_id uuid not null references public.kaarigars(id) on delete cascade,
  customer_name text not null default 'Neighbour',
  rating integer not null check (rating between 1 and 5),
  comment text not null default '',
  photo_url text,
  created_at timestamptz not null default now()
);

-- Strict Row-Level Security (RLS)
alter table public.kaarigars enable row level security;
alter table public.services enable row level security;
alter table public.kaarigar_photos enable row level security;
alter table public.orders enable row level security;
alter table public.order_messages enable row level security;
alter table public.reviews enable row level security;

-- Only a Kaarigar can read/update her own full kaarigars row (which holds private_location & phone)
create policy "Owner reads own kaarigar row" on public.kaarigars
  for select using (auth.uid() = user_id);
create policy "Owner updates own kaarigar row" on public.kaarigars
  for update using (auth.uid() = user_id);
create policy "Owner inserts own kaarigar row" on public.kaarigars
  for insert with check (auth.uid() = user_id);

create policy "Public read services" on public.services for select using (true);
create policy "Public read photos" on public.kaarigar_photos for select using (true);
create policy "Public read reviews" on public.reviews for select using (true);

-- Orders: ONLY the customer who placed the order OR the Kaarigar who owns that shop can view it
create policy "Order participants read orders" on public.orders
  for select using (
    auth.uid() = customer_id
    or exists (
      select 1 from public.kaarigars k
      where k.id = orders.kaarigar_id and k.user_id = auth.uid()
    )
  );
create policy "Authenticated customer creates order" on public.orders
  for insert with check (auth.uid() = customer_id);
create policy "Shop owner updates order status" on public.orders
  for update using (
    exists (
      select 1 from public.kaarigars k
      where k.id = orders.kaarigar_id and k.user_id = auth.uid()
    )
  );

-- Messages: ONLY order participants can read or send chat messages
create policy "Order participants access messages" on public.order_messages
  for all using (
    exists (
      select 1 from public.orders o
      left join public.kaarigars k on k.id = o.kaarigar_id
      where o.id = order_messages.order_id
        and (o.customer_id = auth.uid() or k.user_id = auth.uid())
    )
  );

-- Public Geospatial Discovery RPC: Computes true distance in PostGIS, NEVER exposes private_location or phone
create or replace function public.nearby_kaarigars(
  user_lat double precision,
  user_lng double precision,
  max_radius_km double precision default 5.0
)
returns table (
  id uuid,
  business_name text,
  owner_name text,
  emoji text,
  theme_color text,
  area_name text,
  masked_lat double precision,
  masked_lng double precision,
  distance_km numeric,
  service_radius_km numeric,
  open_time text,
  close_time text,
  is_open boolean,
  daily_cap integer,
  orders_today bigint,
  taking_orders boolean,
  id_verified boolean,
  rating numeric,
  review_count integer,
  trust_score integer
)
language sql
security definer
as $$
  with today_counts as (
    select kaarigar_id, count(*) as cnt
    from public.orders
    where created_at >= date_trunc('day', now())
      and status <> 'cancelled'
    group by kaarigar_id
  )
  select
    k.id,
    k.business_name,
    k.owner_name,
    k.emoji,
    k.theme_color,
    k.area_name,
    k.masked_lat,
    k.masked_lng,
    round((st_distance(
      k.private_location,
      st_setsrid(st_makepoint(user_lng, user_lat), 4326)::geography
    ) / 1000.0)::numeric, 2) as distance_km,
    k.service_radius_km,
    k.open_time,
    k.close_time,
    k.is_open,
    k.daily_cap,
    coalesce(tc.cnt, 0) as orders_today,
    (k.is_open and coalesce(tc.cnt, 0) < k.daily_cap) as taking_orders,
    k.id_verified,
    k.rating,
    k.review_count,
    k.trust_score
  from public.kaarigars k
  left join today_counts tc on tc.kaarigar_id = k.id
  where st_dwithin(
    k.private_location,
    st_setsrid(st_makepoint(user_lng, user_lat), 4326)::geography,
    max_radius_km * 1000.0
  )
  order by distance_km asc;
$$;
