-- Dias passados: atividade fechada = só leitura; aberta = pode receber só o fechamento (uma vez).
create or replace function public.travar_passado() returns trigger language plpgsql security definer set search_path = public as $$
declare v_hoje date;
begin
  if coalesce(auth.role(), '') = 'service_role' or pg_trigger_depth() > 1 then
    return coalesce(new, old); -- backend (google-sync) e cascatas
  end if;
  select (now() at time zone coalesce(m.fuso, 'America/Sao_Paulo'))::date into v_hoje from public.membros m where m.user_id = old.user_id limit 1;
  v_hoje := coalesce(v_hoje, (now() at time zone 'America/Sao_Paulo')::date);
  if old.data >= v_hoje then
    if tg_op = 'UPDATE' and new.data < v_hoje then raise exception 'Não é possível mover uma atividade para um dia passado.'; end if;
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE' then raise exception 'Atividades de dias passados não podem ser excluídas.'; end if;
  if old.status_pessoal is not null then raise exception 'Atividade de dia passado já fechada: somente leitura.'; end if;
  if (new.data, new.hora, new.titulo, coalesce(new.observacao, ''), new.duracao_min, new.categoria_id, new.subcategoria_id, new.user_id, new.familia_id)
     is distinct from (old.data, old.hora, old.titulo, coalesce(old.observacao, ''), old.duracao_min, old.categoria_id, old.subcategoria_id, old.user_id, old.familia_id) then
    raise exception 'Em dias passados só é possível fechar a atividade (feito, status e comentário).';
  end if;
  if new.status_pessoal is null then raise exception 'Para fechar uma atividade de dia passado, informe o status pessoal.'; end if;
  return new;
end $$;
drop trigger if exists a0_travar_passado on public.atividades;
create trigger a0_travar_passado before update or delete on public.atividades for each row execute function public.travar_passado();
