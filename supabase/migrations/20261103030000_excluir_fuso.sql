-- A policy usava current_date (UTC): depois das 21h em São Paulo, "hoje" já era amanhã em UTC e a exclusão
-- era filtrada em silêncio pelo RLS. Usa a data no fuso do membro (padrão America/Sao_Paulo).
drop policy if exists ativ_excluir on public.atividades;
create policy ativ_excluir on public.atividades for delete to authenticated using (
  user_id = auth.uid() and data >= (now() at time zone coalesce((select m.fuso from public.membros m where m.user_id = auth.uid() limit 1), 'America/Sao_Paulo'))::date
);
