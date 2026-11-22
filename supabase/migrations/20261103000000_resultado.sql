-- Checklist verde (feito) / vermelho (não realizado, com motivo obrigatório e pontuação negativa)
alter table public.atividades add column if not exists resultado text check (resultado in ('feito','nao_feito'));
alter table public.atividades disable trigger user;
update public.atividades set resultado = 'feito' where feito and resultado is null;
alter table public.atividades enable trigger user;
alter table public.atividades drop constraint if exists atividades_motivo_nao_feito;
alter table public.atividades add constraint atividades_motivo_nao_feito
  check (resultado is distinct from 'nao_feito' or length(btrim(coalesce(status_texto, ''))) > 0);
alter table public.atividades drop column pontos;
alter table public.atividades add column pontos int generated always as (
  case when resultado = 'nao_feito' then -5
       else (case when feito then 10 else 0 end) + (case when status_pessoal = 'fiz_bem' then 5 else 0 end) end) stored;
