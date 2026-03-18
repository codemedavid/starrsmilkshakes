-- supabase/migrations/20260318000000_add_customers.sql

-- ── 1. customers table ─────────────────────────────────────────────────────
create table if not exists public.customers (
  id                      uuid primary key default gen_random_uuid(),
  name                    text not null,
  email                   text unique,   -- nullable; multiple NULLs allowed (PG semantics)
  phone                   text unique,   -- nullable; stored digits-only e.g. 09171234567
  messenger_psid          text unique,
  messenger_name          text,
  source                  text not null default 'manual' check (source in ('messenger','manual')),
  notes                   text,
  -- cached stat columns (trigger-maintained)
  total_spent             numeric not null default 0,
  order_count             int     not null default 0,
  avg_order_value         numeric not null default 0,
  last_order_at           timestamptz,
  favorite_items          jsonb,  -- [{id: string|null, name: string, count: number}]
  preferred_service_type  text,
  preferred_branch_id     uuid references public.branches(id) on delete set null,
  avg_order_interval_days numeric,  -- NULL when order_count <= 1
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index if not exists customers_phone_idx           on public.customers(phone);
create index if not exists customers_email_idx           on public.customers(email);
create index if not exists customers_messenger_psid_idx  on public.customers(messenger_psid);
create index if not exists customers_last_order_at_idx   on public.customers(last_order_at desc);
create index if not exists customers_total_spent_idx     on public.customers(total_spent desc);

-- ── 2. customer_tags table ─────────────────────────────────────────────────
create table if not exists public.customer_tags (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  tag         text not null,
  tag_type    text not null default 'manual' check (tag_type in ('auto','manual')),
  created_at  timestamptz not null default now(),
  unique (customer_id, tag)
);

create index if not exists customer_tags_customer_id_idx on public.customer_tags(customer_id);

-- ── 3. Add customer_id to orders ───────────────────────────────────────────
alter table public.orders
  add column if not exists customer_id uuid references public.customers(id) on delete set null;

create index if not exists orders_customer_id_idx on public.orders(customer_id);

-- ── 4. Stats trigger function ──────────────────────────────────────────────
create or replace function public.update_customer_stats(p_customer_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total_spent             numeric;
  v_order_count             int;
  v_avg_order_value         numeric;
  v_last_order_at           timestamptz;
  v_favorite_items          jsonb;
  v_preferred_service_type  text;
  v_preferred_branch_id     uuid;
  v_avg_interval            numeric;
begin
  -- total_spent: sum of completed order totals
  select coalesce(sum(total), 0)
    into v_total_spent
    from public.orders
   where customer_id = p_customer_id
     and status = 'completed';

  -- order_count: completed orders only
  select coalesce(count(*), 0)
    into v_order_count
    from public.orders
   where customer_id = p_customer_id
     and status = 'completed';

  -- avg_order_value: COALESCE wraps NULLIF so the NOT NULL column always gets 0 (not NULL)
  -- when no orders exist. Spec formula: total_spent / NULLIF(order_count, 0).
  v_avg_order_value := coalesce(v_total_spent / nullif(v_order_count, 0), 0);

  -- last_order_at: most recent completed order
  select max(created_at)
    into v_last_order_at
    from public.orders
   where customer_id = p_customer_id
     and status = 'completed';

  -- favorite_items: top 5 by count (completed orders only).
  -- Group by menu_item_id when non-null; fall back to menu_item_name for legacy null-id rows.
  -- GROUP BY (menu_item_id, CASE ...) ensures null-id rows group by name, non-null by UUID.
  select jsonb_agg(item order by item_count desc)
    into v_favorite_items
    from (
      select
        jsonb_build_object(
          'id',    oi.menu_item_id,        -- null for legacy rows (PostgreSQL serialises uuid as text in jsonb)
          'name',  min(oi.menu_item_name), -- aggregate: same name for id-grouped rows; any for name-grouped
          'count', count(*)
        ) as item,
        count(*) as item_count
      from public.order_items oi
      join public.orders o on o.id = oi.order_id
     where o.customer_id = p_customer_id
       and o.status = 'completed'
     group by oi.menu_item_id,
              case when oi.menu_item_id is null then oi.menu_item_name else null end
     order by count(*) desc
     limit 5
    ) sub;

  -- preferred_service_type: mode (completed orders only)
  select service_type
    into v_preferred_service_type
    from public.orders
   where customer_id = p_customer_id
     and status = 'completed'
   group by service_type
   order by count(*) desc
   limit 1;

  -- preferred_branch_id: mode (completed orders only, branch_id is uuid type, no cast needed)
  select branch_id
    into v_preferred_branch_id
    from public.orders
   where customer_id = p_customer_id
     and status = 'completed'
     and branch_id is not null
   group by branch_id
   order by count(*) desc
   limit 1;

  -- avg_order_interval_days: NULL when <= 1 order (completed orders only)
  if v_order_count <= 1 then
    v_avg_interval := null;
  else
    select avg(gap_days)
      into v_avg_interval
      from (
        select extract(epoch from (created_at - lag(created_at) over (order by created_at))) / 86400.0 as gap_days
          from public.orders
         where customer_id = p_customer_id
           and status = 'completed'
      ) gaps
     where gap_days is not null;
  end if;

  -- write all stats back
  update public.customers set
    total_spent             = v_total_spent,
    order_count             = v_order_count,
    avg_order_value         = v_avg_order_value,
    last_order_at           = v_last_order_at,
    favorite_items          = v_favorite_items,
    preferred_service_type  = v_preferred_service_type,
    preferred_branch_id     = v_preferred_branch_id,
    avg_order_interval_days = v_avg_interval,
    updated_at              = now()
  where id = p_customer_id;
end;
$$;

-- ── 5. Trigger on orders ───────────────────────────────────────────────────
create or replace function public.orders_customer_stats_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- handle old customer_id (on UPDATE/DELETE)
  if (tg_op = 'UPDATE' or tg_op = 'DELETE') and old.customer_id is not null then
    perform public.update_customer_stats(old.customer_id);
  end if;
  -- handle new customer_id (on INSERT/UPDATE)
  if tg_op = 'INSERT' and new.customer_id is not null then
    -- INSERT: OLD does not exist, always recalculate
    perform public.update_customer_stats(new.customer_id);
  elsif tg_op = 'UPDATE' and new.customer_id is not null then
    if new.customer_id is distinct from old.customer_id then
      perform public.update_customer_stats(new.customer_id);
    elsif new.status <> old.status or new.total <> old.total then
      perform public.update_customer_stats(new.customer_id);
    end if;
  end if;
  return null;
end;
$$;

create or replace trigger orders_customer_stats
  after insert or update or delete on public.orders
  for each row execute function public.orders_customer_stats_trigger();

-- ── 6. updated_at trigger for customers ───────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql security definer set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;

create or replace trigger customers_updated_at
  before update on public.customers
  for each row execute function public.set_updated_at();
