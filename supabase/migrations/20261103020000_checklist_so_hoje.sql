-- Checklist (verde/vermelho, status, motivo, comentário) só no dia de HOJE (fuso do membro, padrão America/Sao_Paulo).
-- Dias passados: somente leitura. Pendências passadas não bloqueiam mais nada (ficam sem marcação, 0 pts).
create or replace function public.travar_passado() returns trigger language plpgsql security definer set search_path = public as $$
declare v_hoje date;
begin
  if coalesce(auth.role(), '') = 'service_role' or pg_trigger_depth() > 1 then
    return coalesce(new, old);
  end if;
  select (now() at time zone coalesce(m.fuso, 'America/Sao_Paulo'))::date into v_hoje from public.membros m where m.user_id = old.user_id limit 1;
  v_hoje := coalesce(v_hoje, (now() at time zone 'America/Sao_Paulo')::date);
  if old.data < v_hoje then
    if tg_op = 'DELETE' then raise exception 'Atividades de dias passados não podem ser excluídas.'; end if;
    raise exception 'Dia passado: atividade somente leitura (o checklist só vale no dia).';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  if new.data < v_hoje then raise exception 'Não é possível mover uma atividade para um dia passado.'; end if;
  if old.data > v_hoje and (new.feito, new.status_pessoal, coalesce(new.status_texto, ''), new.resultado, new.motivo_nao_feito)
       is distinct from (old.feito, old.status_pessoal, coalesce(old.status_texto, ''), old.resultado, old.motivo_nao_feito) then
    raise exception 'O checklist só pode ser marcado no dia da atividade.';
  end if;
  return new;
end $$;

create or replace function public.validar_atividade() returns trigger language plpgsql security definer set search_path = public as $$
declare v_hoje date;
begin
  select (now() at time zone coalesce(m.fuso, 'America/Sao_Paulo'))::date into v_hoje from public.membros m where m.user_id = new.user_id;
  v_hoje := coalesce(v_hoje, (now() at time zone 'America/Sao_Paulo')::date);
  new.atualizado_em := now();
  if tg_op = 'INSERT' then
    new.familia_id := (select familia_id from public.membros where user_id = new.user_id);
    if new.data < v_hoje then raise exception 'Não é possível criar atividades em dias passados.'; end if;
  else
    if new.user_id <> old.user_id or new.data <> old.data and new.data < v_hoje then raise exception 'Alteração não permitida.'; end if;
  end if;
  return new;
end $$;
