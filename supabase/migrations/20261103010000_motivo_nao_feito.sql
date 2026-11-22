-- Vermelho: motivo obrigatório (faltou tempo -5, sem disposição -5, mudou o plano -2) + comentário
alter table public.atividades add column if not exists motivo_nao_feito text check (motivo_nao_feito in ('falta_tempo','sem_disposicao','mudou_plano'));
alter table public.atividades drop constraint if exists atividades_motivo_nao_feito;
alter table public.atividades add constraint atividades_motivo_nao_feito
  check (resultado is distinct from 'nao_feito' or (motivo_nao_feito is not null and length(btrim(coalesce(status_texto, ''))) > 0));
alter table public.atividades drop column pontos;
alter table public.atividades add column pontos int generated always as (
  case when resultado = 'nao_feito' then (case when motivo_nao_feito = 'mudou_plano' then -2 else -5 end)
       else (case when feito then 10 else 0 end) + (case when status_pessoal = 'fiz_bem' then 5 else 0 end) end) stored;
