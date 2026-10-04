create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name')
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = excluded.full_name,
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert or update of email, raw_user_meta_data on auth.users
  for each row execute function public.handle_new_user();

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  size_kg numeric(7, 2) not null check (size_kg > 0),
  price_ngn integer not null check (price_ngn > 0),
  active boolean not null default true,
  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists products_name_size_unique
  on public.products (name, size_kg);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete restrict,
  customer_name text not null,
  customer_email text not null,
  customer_phone text not null,
  payment_method text not null check (payment_method in ('cash', 'transfer')),
  status text not null default 'placed' check (status in ('placed', 'confirmed', 'collected', 'cancelled')),
  total_ngn bigint not null check (total_ngn >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.cart_items (
  user_id uuid not null references auth.users (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  quantity integer not null check (quantity > 0 and quantity <= 99),
  updated_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  product_name text not null,
  size_kg numeric(7, 2) not null,
  unit_price_ngn integer not null check (unit_price_ngn >= 0),
  quantity integer not null check (quantity > 0 and quantity <= 99),
  line_total_ngn bigint not null check (line_total_ngn >= 0)
);

create index if not exists orders_user_id_created_at_idx
  on public.orders (user_id, created_at desc);
create index if not exists order_items_order_id_idx
  on public.order_items (order_id);

alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.cart_items enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
grant usage on schema public to anon, authenticated;

drop policy if exists "Users can read their own profile" on public.profiles;
create policy "Users can read their own profile"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

drop policy if exists "Anyone can read active products" on public.products;
create policy "Anyone can read active products"
  on public.products for select to anon, authenticated
  using (active = true);

drop policy if exists "Users can read their own orders" on public.orders;
create policy "Users can read their own orders"
  on public.orders for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Users can manage their own cart" on public.cart_items;
create policy "Users can manage their own cart"
  on public.cart_items for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Users can read items in their own orders" on public.order_items;
create policy "Users can read items in their own orders"
  on public.order_items for select to authenticated
  using (
    exists (
      select 1 from public.orders
      where orders.id = order_items.order_id
        and orders.user_id = (select auth.uid())
    )
  );

grant select on public.profiles to authenticated;
grant select on public.products to anon, authenticated;
grant select, insert, update, delete on public.cart_items to authenticated;
grant select on public.orders to authenticated;
grant select on public.order_items to authenticated;

insert into public.products (name, description, size_kg, price_ngn, active, is_sample)
values
  ('Rano Rice 5kg', 'A convenient size for smaller households and everyday meals.', 5, 8000, true, true),
  ('Rano Rice 10kg', 'A family-friendly bag of quality Rano Rice.', 10, 15000, true, true),
  ('Rano Rice 25kg', 'A generous size for family tables and gatherings.', 25, 35000, true, true),
  ('Rano Rice 50kg', 'A full-size bag for bigger households and bulk buyers.', 50, 68000, true, true)
on conflict do nothing;

create or replace function public.place_order(
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text,
  p_payment_method text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  new_order_id uuid;
  order_total bigint := 0;
  item jsonb;
  selected_product public.products%rowtype;
  item_quantity integer;
  item_count integer := 0;
  response_items jsonb := '[]'::jsonb;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;
  if p_customer_name is null or length(trim(p_customer_name)) < 2 or length(trim(p_customer_name)) > 100 then
    raise exception 'Invalid customer name';
  end if;
  if p_customer_email is null or length(trim(p_customer_email)) > 320 then
    raise exception 'Invalid customer email';
  end if;
  if p_customer_phone is null or length(trim(p_customer_phone)) < 6 or length(trim(p_customer_phone)) > 30 then
    raise exception 'Invalid customer phone';
  end if;
  if p_payment_method not in ('cash', 'transfer') then
    raise exception 'Invalid payment method';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 30 then
    raise exception 'Invalid order items';
  end if;

  insert into public.orders (
    user_id, customer_name, customer_email, customer_phone, payment_method, total_ngn
  ) values (
    current_user_id, trim(p_customer_name), trim(p_customer_email), trim(p_customer_phone), p_payment_method, 0
  ) returning id into new_order_id;

  for item in select value from jsonb_array_elements(p_items)
  loop
    item_count := item_count + 1;
    if item_count > 30
      or jsonb_typeof(item -> 'productId') <> 'string'
      or jsonb_typeof(item -> 'quantity') <> 'number'
    then
      raise exception 'Invalid order item';
    end if;

    item_quantity := (item ->> 'quantity')::integer;
    if item_quantity < 1 or item_quantity > 99 then
      raise exception 'Invalid item quantity';
    end if;

    select * into selected_product
    from public.products
    where id = (item ->> 'productId')::uuid and active = true
    for share;
    if not found then
      raise exception 'One or more products are no longer available';
    end if;
    if selected_product.is_sample then
      raise exception 'Product prices must be verified before checkout';
    end if;

    insert into public.order_items (
      order_id, product_id, product_name, size_kg, unit_price_ngn, quantity, line_total_ngn
    ) values (
      new_order_id,
      selected_product.id,
      selected_product.name,
      selected_product.size_kg,
      selected_product.price_ngn,
      item_quantity,
      selected_product.price_ngn::bigint * item_quantity
    );
    order_total := order_total + selected_product.price_ngn::bigint * item_quantity;
    response_items := response_items || jsonb_build_array(jsonb_build_object(
      'name', selected_product.name,
      'quantity', item_quantity,
      'unit_price_ngn', selected_product.price_ngn
    ));
  end loop;

  update public.orders set total_ngn = order_total where id = new_order_id;
  delete from public.cart_items where user_id = current_user_id;
  return jsonb_build_object('id', new_order_id, 'total_ngn', order_total, 'items', response_items);
end;
$$;

revoke all on function public.place_order(text, text, text, text, jsonb) from public;
grant execute on function public.place_order(text, text, text, text, jsonb) to authenticated;
