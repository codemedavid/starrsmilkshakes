-- supabase/migrations/20260319000000_add_loyalty.sql

-- ── 1. Enums ────────────────────────────────────────────────────────────────

create type public.loyalty_filter_mode as enum ('blocklist', 'allowlist');

create type public.loyalty_booster_applies_to as enum ('stamps', 'points', 'both');

create type public.loyalty_booster_filter_mode as enum ('all', 'category', 'item');

create type public.loyalty_transaction_type as enum (
  'earn_stamps',
  'earn_points',
  'redeem',
  'adjust',
  'expire'
);

create type public.loyalty_redemption_status as enum ('earned', 'claimed', 'expired', 'voided');

create type public.loyalty_session_purpose as enum ('link', 'balance', 'redeem');

-- ── 2. loyalty_config (singleton) ───────────────────────────────────────────

create table if not exists public.loyalty_config (
  id                    uuid primary key default gen_random_uuid(),
  stamps_enabled        boolean not null default true,
  points_enabled        boolean not null default true,
  points_per_peso       numeric not null default 0.1,
  stamps_per_order      integer not null default 1,
  filter_mode           public.loyalty_filter_mode not null default 'blocklist',
  filtered_category_ids uuid[] not null default '{}',
  filtered_item_ids     uuid[] not null default '{}',
  claim_window_days     integer not null default 7,
  updated_at            timestamptz not null default now()
);

-- Insert the singleton default row
insert into public.loyalty_config (id)
values (gen_random_uuid());

create or replace trigger loyalty_config_updated_at
  before update on public.loyalty_config
  for each row execute function public.set_updated_at();

-- ── 3. loyalty_rewards ──────────────────────────────────────────────────────

create table if not exists public.loyalty_rewards (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  description      text,
  image_url        text,
  stamps_required  integer,
  points_required  integer,
  is_active        boolean not null default true,
  sort_order       integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create or replace trigger loyalty_rewards_updated_at
  before update on public.loyalty_rewards
  for each row execute function public.set_updated_at();

-- ── 4. loyalty_cards ────────────────────────────────────────────────────────

create table if not exists public.loyalty_cards (
  id               uuid primary key default gen_random_uuid(),
  customer_id      uuid not null unique references public.customers(id) on delete cascade,
  card_code        text unique,
  current_stamps   integer not null default 0,
  current_points   integer not null default 0,
  goal_reward_id   uuid references public.loyalty_rewards(id) on delete set null,
  lifetime_stamps  integer not null default 0,
  lifetime_points  integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists loyalty_cards_card_code_idx    on public.loyalty_cards(card_code);
create index if not exists loyalty_cards_customer_id_idx  on public.loyalty_cards(customer_id);

create or replace trigger loyalty_cards_updated_at
  before update on public.loyalty_cards
  for each row execute function public.set_updated_at();

-- ── 5. loyalty_transactions (booster_id FK added after boosters table) ──────

create table if not exists public.loyalty_transactions (
  id           uuid primary key default gen_random_uuid(),
  card_id      uuid not null references public.loyalty_cards(id) on delete cascade,
  order_id     uuid references public.orders(id) on delete set null,
  type         public.loyalty_transaction_type not null,
  stamps_delta integer not null default 0,
  points_delta integer not null default 0,
  booster_id   uuid,  -- FK constraint added below after loyalty_boosters exists
  description  text not null default '',
  created_at   timestamptz not null default now()
);

create index if not exists loyalty_transactions_card_id_idx   on public.loyalty_transactions(card_id);
create index if not exists loyalty_transactions_order_id_idx  on public.loyalty_transactions(order_id);

-- ── 6. loyalty_redemptions ──────────────────────────────────────────────────

create table if not exists public.loyalty_redemptions (
  id                uuid primary key default gen_random_uuid(),
  card_id           uuid not null references public.loyalty_cards(id) on delete cascade,
  reward_id         uuid not null references public.loyalty_rewards(id),
  status            public.loyalty_redemption_status not null default 'earned',
  earned_at         timestamptz not null default now(),
  expires_at        timestamptz,
  claimed_at        timestamptz,
  claimed_branch_id uuid references public.branches(id),
  claimed_by        text
);

create index if not exists loyalty_redemptions_card_id_idx  on public.loyalty_redemptions(card_id);
create index if not exists loyalty_redemptions_status_idx   on public.loyalty_redemptions(status);

-- ── 7. loyalty_boosters ─────────────────────────────────────────────────────

create table if not exists public.loyalty_boosters (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  multiplier  numeric not null default 2.0,
  applies_to  public.loyalty_booster_applies_to not null default 'both',
  filter_mode public.loyalty_booster_filter_mode not null default 'all',
  filter_ids  uuid[] not null default '{}',
  starts_at   timestamptz,
  ends_at     timestamptz,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create or replace trigger loyalty_boosters_updated_at
  before update on public.loyalty_boosters
  for each row execute function public.set_updated_at();

-- ── 8. loyalty_sessions ─────────────────────────────────────────────────────

create table if not exists public.loyalty_sessions (
  id         uuid primary key default gen_random_uuid(),
  token      text not null unique,
  psid       text,
  purpose    public.loyalty_session_purpose not null,
  expires_at timestamptz not null,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists loyalty_sessions_token_idx on public.loyalty_sessions(token);

-- ── 9. FK: loyalty_transactions.booster_id → loyalty_boosters ──────────────

alter table public.loyalty_transactions
  add constraint fk_loyalty_transactions_booster
  foreign key (booster_id)
  references public.loyalty_boosters(id)
  on delete set null;

-- ── 10. Atomic redemption RPC ───────────────────────────────────────────────

create or replace function public.redeem_loyalty_reward(
  p_redemption_id uuid,
  p_branch_id     uuid,
  p_claimed_by    text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_card_id        uuid;
  v_reward_id      uuid;
  v_stamps_cost    integer;
  v_points_cost    integer;
begin
  -- Lock the redemption row; only proceed if status = 'earned'
  select card_id, reward_id
    into v_card_id, v_reward_id
    from public.loyalty_redemptions
   where id = p_redemption_id
     and status = 'earned'
  for update;

  if not found then
    raise exception 'Redemption % not found or already processed', p_redemption_id;
  end if;

  -- Get reward costs
  select coalesce(stamps_required, 0), coalesce(points_required, 0)
    into v_stamps_cost, v_points_cost
    from public.loyalty_rewards
   where id = v_reward_id;

  if not found then
    raise exception 'Reward not found for redemption %', p_redemption_id;
  end if;

  -- Deduct from card
  update public.loyalty_cards
     set current_stamps = current_stamps - v_stamps_cost,
         current_points = current_points - v_points_cost,
         updated_at     = now()
   where id = v_card_id;

  -- Mark redemption as claimed
  update public.loyalty_redemptions
     set status            = 'claimed',
         claimed_at        = now(),
         claimed_branch_id = p_branch_id,
         claimed_by        = p_claimed_by
   where id = p_redemption_id;

  -- Insert a 'redeem' transaction record
  insert into public.loyalty_transactions (
    card_id,
    type,
    stamps_delta,
    points_delta,
    description
  ) values (
    v_card_id,
    'redeem',
    -v_stamps_cost,
    -v_points_cost,
    'Reward redeemed: ' || p_redemption_id::text
  );
end;
$$;
