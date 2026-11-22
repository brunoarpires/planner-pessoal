-- Agendamento dos lembretes (rode DEPOIS de publicar a Edge Function "lembretes").
-- Troque SEU-PROJETO e CRON_SECRET (o mesmo valor do secret CRON_SECRET da função).
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule('planner-lembretes', '*/5 * * * *', $$
  select net.http_post(
    url := 'https://SEU-PROJETO.supabase.co/functions/v1/lembretes',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer CRON_SECRET'),
    body := '{}'::jsonb)
$$);
-- Para remover: select cron.unschedule('planner-lembretes');
