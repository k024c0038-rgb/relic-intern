-- TabiAI 初期スキーマ
-- Googleの規約に従い、緯度・経度や写真は保存せず google_place_id のみ保存する。

create extension if not exists pgcrypto;

-- ============================================================
-- profiles
-- ============================================================
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  language text not null default 'ja' check (language in ('ja', 'zh', 'en')),
  is_premium boolean not null default false,
  created_at timestamptz not null default now()
);

-- サインアップ時にプロフィールを自動作成
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- is_premium は本人が書き換えられないようにする（決済連携の service role や SQL エディタから更新する想定）
create or replace function public.protect_premium_flag()
returns trigger
language plpgsql
as $$
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') then
    new.is_premium := old.is_premium;
  end if;
  return new;
end;
$$;

create trigger profiles_protect_premium
  before update on public.profiles
  for each row execute function public.protect_premium_flag();

-- ============================================================
-- trip_plans / plan_spots
-- ============================================================
create table public.trip_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  destination text not null,
  start_date date,
  days integer not null check (days between 1 and 14),
  budget integer check (budget >= 0),
  transport text not null check (transport in ('walk', 'transit', 'car')),
  preferences text[] not null default '{}',
  language text not null default 'ja' check (language in ('ja', 'zh', 'en')),
  summary text,
  is_saved boolean not null default false,
  is_public boolean not null default false,
  created_at timestamptz not null default now()
);
create index trip_plans_user_id_idx on public.trip_plans (user_id);

-- 有料会員以外は is_saved を true にできない
create or replace function public.check_plan_saved_premium()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_saved and (tg_op = 'INSERT' or not old.is_saved) and coalesce(auth.role(), '') in ('anon', 'authenticated') then
    if not exists (select 1 from public.profiles where id = new.user_id and is_premium) then
      raise exception 'premium_required';
    end if;
  end if;
  return new;
end;
$$;

create trigger trip_plans_saved_premium
  before insert or update on public.trip_plans
  for each row execute function public.check_plan_saved_premium();

create table public.plan_spots (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.trip_plans (id) on delete cascade,
  google_place_id text not null,
  is_main boolean not null default false,
  day integer not null check (day >= 1),
  order_index integer not null check (order_index >= 0),
  name text not null,
  category text not null check (category in ('sightseeing', 'food', 'stay', 'other')),
  description text,
  start_time time,
  stay_minutes integer not null default 60 check (stay_minutes >= 0),
  travel_minutes integer not null default 0 check (travel_minutes >= 0),
  estimated_cost integer not null default 0 check (estimated_cost >= 0),
  created_at timestamptz not null default now()
);
create index plan_spots_plan_id_idx on public.plan_spots (plan_id, day, order_index);

-- ============================================================
-- spot_photos（旅行中に自分で撮った写真）
-- ============================================================
create table public.spot_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  plan_id uuid not null references public.trip_plans (id) on delete cascade,
  spot_id uuid not null references public.plan_spots (id) on delete cascade,
  storage_path text not null,
  taken_at timestamptz,
  created_at timestamptz not null default now()
);
create index spot_photos_plan_id_idx on public.spot_photos (plan_id);

-- ============================================================
-- posts
-- ============================================================
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null check (type in ('food', 'stay', 'route')),
  title text not null,
  region text not null,
  body text not null default '',
  place_name text,
  dish_name text,
  highlights text,
  google_place_id text,
  price integer check (price >= 0),
  rating integer check (rating between 1 and 5),
  days integer check (days between 1 and 30),
  transport text check (transport in ('walk', 'transit', 'car')),
  language text not null default 'ja' check (language in ('ja', 'zh', 'en')),
  plan_id uuid references public.trip_plans (id) on delete set null,
  created_at timestamptz not null default now()
);
create index posts_type_created_idx on public.posts (type, created_at desc);
create index posts_region_idx on public.posts (region);
create index posts_google_place_id_idx on public.posts (google_place_id);

create table public.post_route_spots (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  day integer not null default 1 check (day >= 1),
  order_index integer not null check (order_index >= 0),
  name text not null,
  google_place_id text,
  travel_minutes integer check (travel_minutes >= 0),
  created_at timestamptz not null default now()
);
create index post_route_spots_post_idx on public.post_route_spots (post_id, day, order_index);
create index post_route_spots_place_idx on public.post_route_spots (google_place_id);

create table public.post_photos (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  storage_path text not null,
  taken_at timestamptz,
  created_at timestamptz not null default now()
);
create index post_photos_post_idx on public.post_photos (post_id);

create table public.post_likes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (post_id, user_id)
);

create table public.post_saves (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (post_id, user_id)
);

-- 一覧表示用ビュー（いいね数・カバー写真・投稿者名）
create view public.posts_with_stats
with (security_invoker = true) as
select
  p.*,
  coalesce(l.like_count, 0)::int as like_count,
  ph.storage_path as cover_path,
  pr.display_name as author_name
from public.posts p
left join (
  select post_id, count(*) as like_count from public.post_likes group by post_id
) l on l.post_id = p.id
left join lateral (
  select storage_path from public.post_photos where post_id = p.id order by created_at limit 1
) ph on true
left join public.profiles pr on pr.id = p.user_id;

-- ============================================================
-- RPC
-- ============================================================

-- 指定スポットを含むルート投稿で、一緒に回られているスポットを回数順に返す
create or replace function public.get_co_visited_spots(target_place_id text)
returns table (google_place_id text, name text, visit_count bigint)
language sql
stable
set search_path = public
as $$
  with target_posts as (
    select distinct rs.post_id
    from post_route_spots rs
    join posts p on p.id = rs.post_id and p.type = 'route'
    where rs.google_place_id = target_place_id
  )
  select
    rs.google_place_id,
    (array_agg(rs.name order by rs.created_at desc))[1] as name,
    count(distinct rs.post_id) as visit_count
  from post_route_spots rs
  join target_posts tp on tp.post_id = rs.post_id
  where rs.google_place_id is not null
    and rs.google_place_id <> target_place_id
  group by rs.google_place_id
  order by visit_count desc, name
  limit 20;
$$;

-- 候補スポット（place_id の配列）ごとの投稿数・平均評価・いいね数を返す（プラン作成時にAIへ渡す）
create or replace function public.get_place_post_stats(place_ids text[])
returns table (google_place_id text, post_count bigint, avg_rating numeric, like_count bigint, route_count bigint)
language sql
stable
set search_path = public
as $$
  with ids as (select unnest(place_ids) as pid),
  direct as (
    select p.google_place_id as pid,
           count(distinct p.id) as post_count,
           round(avg(p.rating)::numeric, 1) as avg_rating,
           count(l.id) as like_count
    from posts p
    left join post_likes l on l.post_id = p.id
    where p.google_place_id = any(place_ids)
    group by p.google_place_id
  ),
  routes as (
    select rs.google_place_id as pid, count(distinct rs.post_id) as route_count
    from post_route_spots rs
    where rs.google_place_id = any(place_ids)
    group by rs.google_place_id
  )
  select ids.pid,
         coalesce(direct.post_count, 0),
         direct.avg_rating,
         coalesce(direct.like_count, 0),
         coalesce(routes.route_count, 0)
  from ids
  left join direct on direct.pid = ids.pid
  left join routes on routes.pid = ids.pid
  where direct.pid is not null or routes.pid is not null;
$$;

grant execute on function public.get_co_visited_spots(text) to anon, authenticated;
grant execute on function public.get_place_post_stats(text[]) to anon, authenticated;

-- ============================================================
-- RLS
-- ============================================================
alter table public.profiles enable row level security;
alter table public.trip_plans enable row level security;
alter table public.plan_spots enable row level security;
alter table public.spot_photos enable row level security;
alter table public.posts enable row level security;
alter table public.post_route_spots enable row level security;
alter table public.post_photos enable row level security;
alter table public.post_likes enable row level security;
alter table public.post_saves enable row level security;

-- profiles：表示名は誰でも閲覧可、更新は本人のみ
create policy "profiles are readable by everyone" on public.profiles
  for select using (true);
create policy "users update own profile" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- trip_plans：本人または公開プランは閲覧可、作成・更新・削除は本人のみ
create policy "plans readable by owner or public" on public.trip_plans
  for select using (auth.uid() = user_id or is_public);
create policy "plans insert by owner" on public.trip_plans
  for insert with check (auth.uid() = user_id);
create policy "plans update by owner" on public.trip_plans
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "plans delete by owner" on public.trip_plans
  for delete using (auth.uid() = user_id);

-- plan_spots：親プランの権限に従う
create policy "plan spots readable with plan" on public.plan_spots
  for select using (exists (
    select 1 from public.trip_plans t
    where t.id = plan_id and (t.user_id = auth.uid() or t.is_public)
  ));
create policy "plan spots write by plan owner" on public.plan_spots
  for all using (exists (
    select 1 from public.trip_plans t where t.id = plan_id and t.user_id = auth.uid()
  )) with check (exists (
    select 1 from public.trip_plans t where t.id = plan_id and t.user_id = auth.uid()
  ));

-- spot_photos：本人または公開プランは閲覧可、書き込みは本人のみ
create policy "spot photos readable" on public.spot_photos
  for select using (
    auth.uid() = user_id
    or exists (select 1 from public.trip_plans t where t.id = plan_id and t.is_public)
  );
create policy "spot photos insert by owner" on public.spot_photos
  for insert with check (
    auth.uid() = user_id
    and exists (select 1 from public.trip_plans t where t.id = plan_id and t.user_id = auth.uid())
  );
create policy "spot photos update by owner" on public.spot_photos
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "spot photos delete by owner" on public.spot_photos
  for delete using (auth.uid() = user_id);

-- posts：誰でも閲覧可、書き込みは本人のみ
create policy "posts readable by everyone" on public.posts
  for select using (true);
create policy "posts insert by owner" on public.posts
  for insert with check (auth.uid() = user_id);
create policy "posts update by owner" on public.posts
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "posts delete by owner" on public.posts
  for delete using (auth.uid() = user_id);

create policy "route spots readable by everyone" on public.post_route_spots
  for select using (true);
create policy "route spots write by post owner" on public.post_route_spots
  for all using (exists (select 1 from public.posts p where p.id = post_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.posts p where p.id = post_id and p.user_id = auth.uid()));

create policy "post photos readable by everyone" on public.post_photos
  for select using (true);
create policy "post photos write by post owner" on public.post_photos
  for all using (exists (select 1 from public.posts p where p.id = post_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.posts p where p.id = post_id and p.user_id = auth.uid()));

-- likes：件数表示のため誰でも閲覧可、登録・削除は本人のみ
create policy "likes readable by everyone" on public.post_likes
  for select using (true);
create policy "likes insert by owner" on public.post_likes
  for insert with check (auth.uid() = user_id);
create policy "likes delete by owner" on public.post_likes
  for delete using (auth.uid() = user_id);

-- saves：本人のみ
create policy "saves readable by owner" on public.post_saves
  for select using (auth.uid() = user_id);
create policy "saves insert by owner" on public.post_saves
  for insert with check (auth.uid() = user_id);
create policy "saves delete by owner" on public.post_saves
  for delete using (auth.uid() = user_id);

-- ============================================================
-- Storage（撮影したままの写真を保存）
-- パスは "<user_id>/<...>" とし、先頭フォルダで本人確認する
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 20971520, array['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp'])
on conflict (id) do nothing;

create policy "photos are publicly readable" on storage.objects
  for select using (bucket_id = 'photos');
create policy "users upload to own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "users delete own photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
