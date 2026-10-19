-- Политики RLS и полное удаление аккаунта для проекта XYStar.
-- Запуск: Supabase → SQL Editor → вставить → Run.
-- Скрипт идемпотентный: его можно выполнять повторно.
--
-- Зачем: без этих политик Supabase отвечает
--   401 {"code":"42501","message":"new row violates row-level security policy"}
-- на запись в likes/messages/profiles/events/current_consents. Из-за этого
-- лайки не сохраняются, матчи не создаются, сообщения не доходят и анкета
-- не публикуется.

-- ─────────────────────────── Анкета ───────────────────────────
alter table public.profiles enable row level security;

drop policy if exists profiles_read on public.profiles;
drop policy if exists profiles_insert on public.profiles;
drop policy if exists profiles_update on public.profiles;
drop policy if exists profiles_delete on public.profiles;

-- Читать анкеты могут все: так работает лента.
create policy profiles_read on public.profiles for select to anon, authenticated
  using (true);
create policy profiles_insert on public.profiles for insert to authenticated
  with check (auth.uid() = id);
create policy profiles_update on public.profiles for update to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);
create policy profiles_delete on public.profiles for delete to authenticated
  using (auth.uid() = id);

-- ─────────────────────────── Лайки ───────────────────────────
alter table public.likes enable row level security;

drop policy if exists likes_read   on public.likes;
drop policy if exists likes_insert on public.likes;
drop policy if exists likes_update on public.likes;
drop policy if exists likes_delete on public.likes;

create policy likes_read   on public.likes for select to authenticated
  using (from_user = auth.uid() or to_user = auth.uid());
create policy likes_insert on public.likes for insert to authenticated
  with check (from_user = auth.uid());
create policy likes_update on public.likes for update to authenticated
  using (from_user = auth.uid()) with check (from_user = auth.uid());
create policy likes_delete on public.likes for delete to authenticated
  using (from_user = auth.uid());

-- ─────────────────────────── Матчи ───────────────────────────
alter table public.matches enable row level security;

drop policy if exists matches_read   on public.matches;
drop policy if exists matches_insert on public.matches;
drop policy if exists matches_update on public.matches;
drop policy if exists matches_delete on public.matches;

create policy matches_read   on public.matches for select to authenticated
  using (a_user = auth.uid() or b_user = auth.uid());
create policy matches_insert on public.matches for insert to authenticated
  with check (a_user = auth.uid() or b_user = auth.uid());
create policy matches_update on public.matches for update to authenticated
  using (a_user = auth.uid() or b_user = auth.uid());
create policy matches_delete on public.matches for delete to authenticated
  using (a_user = auth.uid() or b_user = auth.uid());

-- ─────────────────────────── Сообщения ───────────────────────────
alter table public.messages enable row level security;

drop policy if exists messages_read   on public.messages;
drop policy if exists messages_insert on public.messages;
drop policy if exists messages_delete on public.messages;

create policy messages_read   on public.messages for select to authenticated
  using (from_user = auth.uid() or to_user = auth.uid());
create policy messages_insert on public.messages for insert to authenticated
  with check (from_user = auth.uid());
create policy messages_delete on public.messages for delete to authenticated
  using (from_user = auth.uid() or to_user = auth.uid());

-- ─────────────────────────── Согласия ───────────────────────────
alter table public.consents          enable row level security;
alter table public.current_consents enable row level security;

drop policy if exists consents_read   on public.consents;
drop policy if exists consents_write  on public.consents;
drop policy if exists cconsents_read  on public.current_consents;
drop policy if exists cconsents_write on public.current_consents;

create policy consents_read   on public.consents for select to authenticated
  using (user_id = auth.uid());
create policy consents_write  on public.consents for insert to authenticated
  with check (user_id = auth.uid());
create policy consents_update on public.consents for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy consents_delete on public.consents for delete to authenticated
  using (user_id = auth.uid());

create policy cconsents_read   on public.current_consents for select to authenticated
  using (user_id = auth.uid());
create policy cconsents_write  on public.current_consents for insert to authenticated
  with check (user_id = auth.uid());
create policy cconsents_update on public.current_consents for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy cconsents_delete on public.current_consents for delete to authenticated
  using (user_id = auth.uid());

-- ───────────────────── Шаги, гео, события ─────────────────────
alter table public.plans     enable row level security;
alter table public.locations enable row level security;
alter table public.events    enable row level security;

drop policy if exists plans_rw     on public.plans;
drop policy if exists locations_rw on public.locations;
drop policy if exists events_rw    on public.events;

create policy plans_rw on public.plans for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy locations_rw on public.locations for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy events_rw on public.events for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ──────────────── Полное удаление аккаунта (152-ФЗ) ────────────────
-- Клиент вызывает supabase.rpc('delete_my_account'): функция сносит все строки
-- пользователя и запись из auth.users. Работает напрямую в Supabase и не
-- зависит от доступности Vercel.
create or replace function public.delete_my_account()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  delete from public.likes            where from_user = uid or to_user = uid;
  delete from public.messages         where from_user = uid or to_user = uid;
  delete from public.matches          where a_user = uid or b_user = uid;
  delete from public.consents          where user_id = uid;
  delete from public.current_consents where user_id = uid;
  delete from public.plans            where user_id = uid;
  delete from public.locations        where user_id = uid;
  delete from public.events           where user_id = uid;
  delete from public.profiles         where id = uid;

  delete from auth.users where id = uid;

  return jsonb_build_object('ok', true, 'authDeleted', true);
end;
$$;

grant execute on function public.delete_my_account() to authenticated;