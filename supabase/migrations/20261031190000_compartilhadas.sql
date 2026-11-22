-- Atividades compartilhadas: um grupo + uma linha por participante.
create table if not exists public.atividade_grupos (
  id uuid primary key default gen_random_uuid(),
  familia_id uuid not null references public.familias(id) on delete cascade,
  criador uuid not null references auth.users(id) on delete cascade,
  toda_familia boolean not null default false,
  criado_em timestamptz not null default now()
);
alter table public.atividades add column if not exists grupo_id uuid references public.atividade_grupos(id) on delete set null;
create index if not exists atividades_grupo on public.atividades (grupo_id);
alter table public.atividade_grupos enable row level security;
drop policy if exists grupo_ver on public.atividade_grupos;
create policy grupo_ver on public.atividade_grupos for select to authenticated using (familia_id = public.minha_familia());

create table if not exists public.notificacoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  titulo text not null, corpo text not null,
  criado_em timestamptz not null default now()
);
alter table public.notificacoes enable row level security; -- só service role

-- Regra dos "dias anteriores 100%": vale para quem cria; participantes convidados não são barrados.
create or replace function public.validar_atividade() returns trigger language plpgsql security definer set search_path = public as $$
declare v_hoje date; v_pend date;
begin
  select (now() at time zone coalesce(m.fuso, 'America/Sao_Paulo'))::date into v_hoje from public.membros m where m.user_id = new.user_id;
  v_hoje := coalesce(v_hoje, current_date);
  new.atualizado_em := now();
  if tg_op = 'INSERT' then
    new.familia_id := (select familia_id from public.membros where user_id = new.user_id);
    if new.data < v_hoje then raise exception 'Não é possível criar atividades em dias passados.'; end if;
    if not (current_setting('planner.compartilhar', true) = '1' and new.user_id is distinct from auth.uid()) then
      select min(data) into v_pend from public.atividades where user_id = new.user_id and data < new.data and status_pessoal is null;
      if v_pend is not null then
        raise exception 'Feche 100%% do checklist de % antes de planejar este dia.', to_char(v_pend, 'DD/MM/YYYY');
      end if;
    end if;
  else
    if new.user_id <> old.user_id or new.data <> old.data and new.data < v_hoje then raise exception 'Alteração não permitida.'; end if;
  end if;
  return new;
end $$;

create or replace function public.criar_compartilhada(p_data date, p_hora time, p_titulo text, p_observacao text, p_duracao int,
  p_categoria uuid, p_subcategoria uuid, p_participantes uuid[], p_toda_familia boolean) returns uuid
  language plpgsql security definer set search_path = public as $$
declare v_fam uuid := public.minha_familia(); v_g uuid; v_u uuid; v_nome text; v_eu text; v_soma int; v_lim int; v_falta text := '';
  v_users uuid[];
begin
  if auth.uid() is null or v_fam is null then raise exception 'Faça login e entre em uma família.'; end if;
  if p_toda_familia then select array_agg(user_id) into v_users from public.membros where familia_id = v_fam;
  else v_users := array(select distinct unnest(coalesce(p_participantes, '{}') || auth.uid())); end if;
  if exists (select 1 from unnest(v_users) u where not exists (select 1 from public.membros m where m.user_id = u and m.familia_id = v_fam)) then
    raise exception 'Participante fora da sua família.'; end if;
  if coalesce(array_length(v_users, 1), 0) < 2 then raise exception 'Escolha pelo menos mais uma pessoa para compartilhar.'; end if;
  -- limite do dia de cada um (mensagem com nomes)
  foreach v_u in array v_users loop
    select nome, horas_dia * 60 into v_nome, v_lim from public.membros where user_id = v_u;
    select coalesce(sum(duracao_min), 0) into v_soma from public.atividades where user_id = v_u and data = p_data;
    if v_soma + p_duracao > v_lim then v_falta := v_falta || case when v_falta = '' then '' else ', ' end || v_nome || ' (restam ' || greatest(v_lim - v_soma, 0) || ' min)'; end if;
  end loop;
  if v_falta <> '' then raise exception 'Não cabe no dia de: %. Desmarque essas pessoas ou reduza o tempo.', v_falta; end if;

  insert into public.atividade_grupos (familia_id, criador, toda_familia) values (v_fam, auth.uid(), coalesce(p_toda_familia, false)) returning id into v_g;
  perform set_config('planner.compartilhar', '1', true);
  foreach v_u in array v_users loop
    insert into public.atividades (user_id, data, hora, titulo, observacao, duracao_min, categoria_id, subcategoria_id, grupo_id)
      values (v_u, p_data, p_hora, trim(p_titulo), nullif(p_observacao, ''), p_duracao, p_categoria, p_subcategoria, v_g);
  end loop;
  perform set_config('planner.compartilhar', '0', true);
  select nome into v_eu from public.membros where user_id = auth.uid();
  insert into public.notificacoes (user_id, titulo, corpo)
    select u, '👥 Atividade compartilhada', v_eu || ' compartilhou "' || trim(p_titulo) || '" em ' || to_char(p_data, 'DD/MM') || coalesce(' às ' || to_char(p_hora, 'HH24:MI'), '')
    from unnest(v_users) u where u <> auth.uid();
  return v_g;
end $$;
revoke execute on function public.criar_compartilhada from public, anon;
grant execute on function public.criar_compartilhada to authenticated;

-- Campos comuns: só o criador altera, e a mudança vai para todas as cópias.
create or replace function public.compartilhada_antes() returns trigger language plpgsql security definer set search_path = public as $$
declare v_criador uuid;
begin
  if old.grupo_id is null or pg_trigger_depth() > 1 or coalesce(auth.role(), '') = 'service_role' then return coalesce(new, old); end if;
  select criador into v_criador from public.atividade_grupos where id = old.grupo_id;
  if tg_op = 'UPDATE' and v_criador is distinct from auth.uid()
     and (new.titulo, new.hora, new.data, coalesce(new.observacao, ''), new.duracao_min, new.categoria_id, new.subcategoria_id)
         is distinct from (old.titulo, old.hora, old.data, coalesce(old.observacao, ''), old.duracao_min, old.categoria_id, old.subcategoria_id) then
    raise exception 'Atividade compartilhada: só quem criou pode alterar título, horário, tempo, categoria e observação.';
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists a1_compartilhada on public.atividades;
create trigger a1_compartilhada before update or delete on public.atividades for each row execute function public.compartilhada_antes();

create or replace function public.compartilhada_depois() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.grupo_id is null or pg_trigger_depth() > 1 then return null; end if;
  if (select criador from public.atividade_grupos where id = old.grupo_id) is distinct from auth.uid() then return null; end if;
  if tg_op = 'UPDATE' then
    if (new.titulo, new.hora, new.data, coalesce(new.observacao, ''), new.duracao_min, new.categoria_id, new.subcategoria_id)
       is distinct from (old.titulo, old.hora, old.data, coalesce(old.observacao, ''), old.duracao_min, old.categoria_id, old.subcategoria_id) then
      update public.atividades set titulo = new.titulo, hora = new.hora, data = new.data, observacao = new.observacao, duracao_min = new.duracao_min,
        categoria_id = new.categoria_id, subcategoria_id = new.subcategoria_id
        where grupo_id = old.grupo_id and id <> old.id;
    end if;
  else -- criador excluiu: remove a atividade de todos
    delete from public.atividades where grupo_id = old.grupo_id and id <> old.id;
  end if;
  return null;
end $$;
drop trigger if exists z_compartilhada_depois on public.atividades;
create trigger z_compartilhada_depois after update or delete on public.atividades for each row execute function public.compartilhada_depois();
