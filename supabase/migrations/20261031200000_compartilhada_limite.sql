-- Criador muda duração/data de uma compartilhada: confere o limite do dia de cada participante e diz quem não cabe.
create or replace function public.compartilhada_antes() returns trigger language plpgsql security definer set search_path = public as $$
declare v_criador uuid; v_falta text;
begin
  if old.grupo_id is null or pg_trigger_depth() > 1 or coalesce(auth.role(), '') = 'service_role' then return coalesce(new, old); end if;
  select criador into v_criador from public.atividade_grupos where id = old.grupo_id;
  if tg_op = 'UPDATE' and v_criador is distinct from auth.uid()
     and (new.titulo, new.hora, new.data, coalesce(new.observacao, ''), new.duracao_min, new.categoria_id, new.subcategoria_id)
         is distinct from (old.titulo, old.hora, old.data, coalesce(old.observacao, ''), old.duracao_min, old.categoria_id, old.subcategoria_id) then
    raise exception 'Atividade compartilhada: só quem criou pode alterar título, horário, tempo, categoria e observação.';
  end if;
  if tg_op = 'UPDATE' and v_criador = auth.uid() and (new.duracao_min, new.data) is distinct from (old.duracao_min, old.data) then
    select string_agg(m.nome || ' (restam ' || greatest(m.horas_dia * 60 - x.soma, 0) || ' min)', ', ' order by m.nome) into v_falta
    from public.atividades c
    join public.membros m on m.user_id = c.user_id
    cross join lateral (select coalesce(sum(o.duracao_min), 0) soma from public.atividades o where o.user_id = c.user_id and o.data = new.data and o.id <> c.id) x
    where c.grupo_id = old.grupo_id and c.id <> old.id and x.soma + new.duracao_min > m.horas_dia * 60;
    if v_falta is not null then raise exception 'Não cabe no dia de: %. Reduza o tempo.', v_falta; end if;
  end if;
  return coalesce(new, old);
end $$;
