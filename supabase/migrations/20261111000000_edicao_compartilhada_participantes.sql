-- Participantes de atividade compartilhada podem editar campos comuns (título, horário, data,
-- observação, duração, categoria/subcategoria). A mudança propaga para todas as cópias do grupo.
-- Exclusão da tarefa inteira (cascata) continua só do criador; não-criador só remove a própria cópia.
-- Recorrências: participante da série pode atualizar o modelo ("Esta e as próximas").

create or replace function public.compartilhada_antes() returns trigger language plpgsql security definer set search_path = public as $$
declare v_falta text;
begin
  if old.grupo_id is null or pg_trigger_depth() > 1 or coalesce(auth.role(), '') = 'service_role' then return coalesce(new, old); end if;
  -- Qualquer participante (atualizando a própria linha via RLS) pode alterar campos comuns.
  -- Ao mudar duração/data, confere se cabe no dia de cada participante do grupo.
  if tg_op = 'UPDATE' and (new.duracao_min, new.data) is distinct from (old.duracao_min, old.data) then
    select string_agg(m.nome || ' (restam ' || greatest(m.horas_dia * 60 - x.soma, 0) || ' min)', ', ' order by m.nome) into v_falta
    from public.atividades c
    join public.membros m on m.user_id = c.user_id
    cross join lateral (select coalesce(sum(o.duracao_min), 0) soma from public.atividades o where o.user_id = c.user_id and o.data = new.data and o.id <> c.id) x
    where c.grupo_id = old.grupo_id and c.id <> old.id and x.soma + new.duracao_min > m.horas_dia * 60;
    if v_falta is not null then raise exception 'Não cabe no dia de: %. Reduza o tempo.', v_falta; end if;
  end if;
  return coalesce(new, old);
end $$;

create or replace function public.compartilhada_depois() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.grupo_id is null or pg_trigger_depth() > 1 then return null; end if;
  if tg_op = 'UPDATE' then
    -- Propaga campos comuns a partir de qualquer participante (não só o criador).
    if (new.titulo, new.hora, new.data, coalesce(new.observacao, ''), new.duracao_min, new.categoria_id, new.subcategoria_id)
       is distinct from (old.titulo, old.hora, old.data, coalesce(old.observacao, ''), old.duracao_min, old.categoria_id, old.subcategoria_id) then
      update public.atividades set titulo = new.titulo, hora = new.hora, data = new.data, observacao = new.observacao, duracao_min = new.duracao_min,
        categoria_id = new.categoria_id, subcategoria_id = new.subcategoria_id
        where grupo_id = old.grupo_id and id <> old.id;
    end if;
  else
    -- DELETE: só o criador remove a atividade de todos; demais participantes saem só da própria cópia.
    if (select criador from public.atividade_grupos where id = old.grupo_id) is distinct from auth.uid() then return null; end if;
    delete from public.atividades where grupo_id = old.grupo_id and id <> old.id;
  end if;
  return null;
end $$;

-- Modelo da série: criador ou quem já tem ocorrência vinculada pode atualizar (para "Esta e as próximas").
drop policy if exists rec_editar on public.recorrencias;
create policy rec_editar on public.recorrencias for update to authenticated
  using (
    criador = auth.uid()
    or exists (select 1 from public.atividades a where a.recorrencia_id = recorrencias.id and a.user_id = auth.uid())
  )
  with check (
    criador = auth.uid()
    or exists (select 1 from public.atividades a where a.recorrencia_id = recorrencias.id and a.user_id = auth.uid())
  );
