-- WalkDate: полная очистка тестовых аккаунтов и связанных данных.
-- Выполнить в Supabase Dashboard → SQL Editor → New query → Run.
-- Пропускает таблицы, которых нет в текущей базе.
-- auth.users каскадно удалит profiles / likes / matches / messages и др. (FK on delete cascade).

begin;

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'likes', 'matches', 'messages', 'plans', 'locations',
    'events', 'consents', 'current_consents', 'subscriptions',
    'audit_log', 'reports', 'moderation_status',
    'notifications', 'blocks', 'reports_history'
  ]
  loop
    if exists (
      select 1 from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = t and c.relkind = 'r'
    ) then
      execute format('delete from public.%I', t);
    end if;
  end loop;
end
$$;

delete from auth.users;

commit;

-- Проверки (должны вернуть 0 везде):
select
  (select count(*) from auth.users)      as auth_users,
  (select count(*) from public.profiles) as profiles,
  (select count(*) from public.likes)    as likes,
  (select count(*) from public.matches)  as matches,
  (select count(*) from public.messages) as messages;
