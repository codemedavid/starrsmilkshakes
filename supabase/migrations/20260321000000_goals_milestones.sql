-- supabase/migrations/20260321000000_goals_milestones.sql
-- Loyalty Goals & Milestones Redesign

-- ── 1. Rename loyalty_rewards → loyalty_goals ─────────────────────────────────
alter table public.loyalty_rewards rename to loyalty_goals;

-- ── 2. Rename FK columns ──────────────────────────────────────────────────────
alter table public.loyalty_cards rename column goal_reward_id to goal_id;
alter table public.loyalty_redemptions rename column reward_id to goal_id;

-- ── 3. Rename FK constraints to match new names ──────────────────────────────
alter table public.loyalty_cards
  rename constraint loyalty_cards_goal_reward_id_fkey to loyalty_cards_goal_id_fkey;

alter table public.loyalty_redemptions
  rename constraint loyalty_redemptions_reward_id_fkey to loyalty_redemptions_goal_id_fkey;

-- ── 4. Create loyalty_milestones table ────────────────────────────────────────
create table public.loyalty_milestones (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  image_url   text,
  stamps_required integer not null check (stamps_required > 0),
  is_active   boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Auto-update updated_at
create trigger set_updated_at_loyalty_milestones
  before update on public.loyalty_milestones
  for each row execute function public.set_updated_at();

-- ── 5. Create loyalty_milestone_claims table ──────────────────────────────────
create table public.loyalty_milestone_claims (
  id           uuid primary key default gen_random_uuid(),
  card_id      uuid not null references public.loyalty_cards(id) on delete cascade,
  milestone_id uuid not null references public.loyalty_milestones(id) on delete cascade,
  goal_id      uuid not null references public.loyalty_goals(id) on delete cascade,
  earned_at    timestamptz not null default now(),
  claimed_at   timestamptz not null default now(),
  created_at   timestamptz not null default now(),

  constraint uq_milestone_per_goal_cycle unique (card_id, milestone_id, goal_id)
);

create index idx_milestone_claims_card_goal on public.loyalty_milestone_claims (card_id, goal_id);

-- ── 6. Enable RLS ────────────────────────────────────────────────────────────
alter table public.loyalty_milestones enable row level security;
alter table public.loyalty_milestone_claims enable row level security;

create policy "Allow public read on milestones"
  on public.loyalty_milestones for select using (true);

create policy "Allow public read on milestone_claims"
  on public.loyalty_milestone_claims for select using (true);

create policy "Allow service role all on milestones"
  on public.loyalty_milestones for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "Allow service role all on milestone_claims"
  on public.loyalty_milestone_claims for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- ── 7. Replace redeem_loyalty_reward with redeem_loyalty_goal ─────────────────
drop function if exists public.redeem_loyalty_reward(uuid, uuid, text);

create or replace function public.redeem_loyalty_goal(
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
  v_goal_id        uuid;
  v_stamps_cost    integer;
  v_points_cost    integer;
begin
  -- Lock the redemption row; only proceed if status = 'earned'
  select card_id, goal_id
    into v_card_id, v_goal_id
    from public.loyalty_redemptions
   where id = p_redemption_id
     and status = 'earned'
  for update;

  if not found then
    raise exception 'Redemption % not found or already processed', p_redemption_id;
  end if;

  -- Get goal costs
  select coalesce(stamps_required, 0), coalesce(points_required, 0)
    into v_stamps_cost, v_points_cost
    from public.loyalty_goals
   where id = v_goal_id;

  if not found then
    raise exception 'Goal not found for redemption %', p_redemption_id;
  end if;

  -- Deduct from card and clear goal_id (unlock for new goal selection)
  update public.loyalty_cards
     set current_stamps = current_stamps - v_stamps_cost,
         current_points = current_points - v_points_cost,
         goal_id        = null,
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
    card_id, type, stamps_delta, points_delta, description
  ) values (
    v_card_id, 'redeem', -v_stamps_cost, -v_points_cost,
    'Goal redeemed: ' || p_redemption_id::text
  );
end;
$$;
