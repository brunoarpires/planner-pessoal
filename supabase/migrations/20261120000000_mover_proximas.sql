-- "Esta e as próximas": permitir mudar a data e deslocar a série a partir da ocorrência.
-- RPC atômica; não marcar data_movida (exceção) quando o deslocamento é da série inteira.
-- NÃO aplicar automaticamente em produção sem revisão — incluir no deploy manual.

-- Trigger de data: série movida em lote não vira exceção (flag de sessão local à transação).
create or replace function public.mover_data() returns trigger language plpgsql security definer set search_path = public as $$
declare v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if new.data is distinct from old.data then
    if new.data < v_hoje and coalesce(auth.role(), '') <> 'service_role' then
      raise exception 'A nova data não pode ser anterior a hoje (%).', to_char(v_hoje, 'DD/MM/YYYY');
    end if;
    -- Só "Só esta": marca exceção. Movimento de série (mover_proximas) define planner.movendo_serie=1.
    if new.recorrencia_id is not null
       and coalesce(current_setting('planner.movendo_serie', true), '') <> '1' then
      new.data_movida := true;
    end if;
  end if;
  return new;
end $$;

-- Desloca ocorrências abertas (data >= ocorrência) do usuário; compartilhadas propagam via trigger.
-- Atualiza data_inicio / dias_semana / gerado_ate / fim_data e modelo.data se existir.
create or replace function public.mover_proximas(p_ativ uuid, p_nova_data date) returns int
  language plpgsql security definer set search_path = public as $$
declare
  a public.atividades;
  r public.recorrencias;
  v_delta int;
  v_hoje date;
  v_dias int[];
  n int := 0;
begin
  select * into a from public.atividades where id = p_ativ and user_id = auth.uid();
  if a.id is null or a.recorrencia_id is null then
    raise exception 'Atividade não encontrada.';
  end if;
  if p_nova_data is null or p_nova_data = a.data then
    return 0;
  end if;

  select (now() at time zone coalesce(m.fuso, 'America/Sao_Paulo'))::date into v_hoje
    from public.membros m where m.user_id = auth.uid() limit 1;
  v_hoje := coalesce(v_hoje, (now() at time zone 'America/Sao_Paulo')::date);
  if p_nova_data < v_hoje then
    raise exception 'A nova data não pode ser anterior a hoje (%).', to_char(v_hoje, 'DD/MM/YYYY');
  end if;

  v_delta := p_nova_data - a.data;
  select * into r from public.recorrencias where id = a.recorrencia_id for update;
  if r.id is null then raise exception 'Série não encontrada.'; end if;
  if r.criador is distinct from auth.uid()
     and not exists (
       select 1 from public.atividades x where x.recorrencia_id = r.id and x.user_id = auth.uid()
     ) then
    raise exception 'Sem permissão.';
  end if;

  -- Evita marcar data_movida e sinaliza movimento de série aos triggers.
  perform set_config('planner.movendo_serie', '1', true);

  -- Duas fases: evita colisão com índice único (user_id, recorrencia_id, data, hora).
  update public.atividades
     set data = data + 365000
   where recorrencia_id = r.id and user_id = auth.uid()
     and data >= a.data and status_pessoal is null;

  update public.atividades
     set data = data - 365000 + v_delta
   where recorrencia_id = r.id and user_id = auth.uid()
     and data >= a.data + 365000 and status_pessoal is null;
  get diagnostics n = row_count;

  -- Semanal: gira os dias da semana pelo mesmo delta (0=domingo … 6=sábado, igual ao app).
  v_dias := r.dias_semana;
  if r.tipo = 'semanal' and coalesce(array_length(v_dias, 1), 0) > 0 then
    select array_agg(x order by x) into v_dias
      from (select distinct ((d + v_delta) % 7 + 7) % 7 as x from unnest(v_dias) d) s;
  end if;

  update public.recorrencias set
    data_inicio = data_inicio + v_delta,
    dias_semana = coalesce(v_dias, dias_semana),
    gerado_ate = case when gerado_ate is null then null else gerado_ate + v_delta end,
    fim_data = case when fim_data is null then null else fim_data + v_delta end,
    modelo = case
      when modelo ? 'data' then modelo || jsonb_build_object('data', to_char(p_nova_data, 'YYYY-MM-DD'))
      else modelo
    end
  where id = r.id;

  return n;
end $$;

revoke execute on function public.mover_proximas from public, anon;
grant execute on function public.mover_proximas to authenticated;
