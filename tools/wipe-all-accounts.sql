-- WalkDate: полная очистка тестовых аккаунтов и связанных данных.
-- Выполнить в Supabase Dashboard → SQL Editor → New query → Run.
-- auth.users каскадно удалит profiles / likes / matches / messages /
-- plans / locations / events / consents / current_consents (FK on delete cascade).
-- Таблицы с текстовым user_id (без FK) чистим отдельно ниже.

begin;

delete from public.profiles;
delete from public.likes;
delete from public.matches;
delete from public.messages;
delete from public.plans;
delete from public.locations;
delete from public.events;
delete from public.consents;
delete from public.current_consents;
delete from public.subscriptions;
delete from public.audit_log;
delete from public.reports;
delete from public.moderation_status;

delete from auth.users;

commit;

-- Проверки (должны вернуть 0 везде):
select
  (select count(*) from auth.users)     as auth_users,
  (select count(*) from public.profiles) as profiles,
  (select count(*) from public.likes)    as likes,
  (select count(*) from public.matches)  as matches,
  (select count(*) from public.messages) as messages;
