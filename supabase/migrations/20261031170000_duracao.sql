-- Tempo previsto por atividade + limite diário (soma <= horas_dia)
alter table public.atividades add column if not exists duracao_min int not null default 30 check (duracao_min between 5 and 1440);

create or replace function public.validar_duracao() returns trigger language plpgsql security definer set search_path = public as $$
declare v_lim int; v_soma int;
begin
  select horas_dia * 60 into v_lim from public.membros where user_id = new.user_id;
  select coalesce(sum(duracao_min), 0) into v_soma from public.atividades
    where user_id = new.user_id and data = new.data and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);
  if v_lim is not null and v_soma + new.duracao_min > v_lim then
    raise exception 'Limite do dia excedido: planejado %h%smin de %h. Restam %.', (v_soma + new.duracao_min) / 60, lpad(((v_soma + new.duracao_min) % 60)::text, 2, '0'), v_lim / 60,
      case when v_lim - v_soma <= 0 then '0 min' else ((v_lim - v_soma) / 60) || 'h' || lpad(((v_lim - v_soma) % 60)::text, 2, '0') || 'min' end;
  end if;
  return new;
end $$;
drop trigger if exists validar_duracao on public.atividades;
create trigger validar_duracao before insert or update of duracao_min, data, user_id on public.atividades for each row execute function public.validar_duracao();

create or replace function public.marcar_sync_google() returns trigger language plpgsql as $$
begin
  if (new.titulo, new.hora, new.data, coalesce(new.observacao, ''), new.feito, coalesce(new.status_pessoal, ''), new.duracao_min)
     is distinct from (old.titulo, old.hora, old.data, coalesce(old.observacao, ''), old.feito, coalesce(old.status_pessoal, ''), old.duracao_min) then
    new.google_sync_pendente := true;
  end if;
  return new;
end $$;
