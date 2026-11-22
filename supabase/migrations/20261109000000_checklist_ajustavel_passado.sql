-- Checklist ajustável em dias passados: marcar/corrigir feito, status, motivo e comentário.
-- O app não bloqueia mais por pendência; detalhes da atividade (título, hora etc.) seguem só leitura no passado.
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
    -- Só checklist pode mudar em dia passado (ajuste livre).
    if (new.titulo, new.hora, new.duracao_min, new.data, new.observacao, new.categoria_id, new.subcategoria_id,
        new.grupo_id, new.recorrencia_id, new.lembrete_canal, new.user_id, new.familia_id)
         is distinct from
       (old.titulo, old.hora, old.duracao_min, old.data, old.observacao, old.categoria_id, old.subcategoria_id,
        old.grupo_id, old.recorrencia_id, old.lembrete_canal, old.user_id, old.familia_id) then
      raise exception 'Dia passado: só o checklist (feito / não realizada / como foi) pode ser ajustado.';
    end if;
    return new;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  if new.data < v_hoje then raise exception 'Não é possível mover uma atividade para um dia passado.'; end if;
  if old.data > v_hoje and (new.feito, new.status_pessoal, coalesce(new.status_texto, ''), new.resultado, new.motivo_nao_feito)
       is distinct from (old.feito, old.status_pessoal, coalesce(old.status_texto, ''), old.resultado, old.motivo_nao_feito) then
    raise exception 'O checklist só pode ser marcado no dia da atividade.';
  end if;
  return new;
end $$;
