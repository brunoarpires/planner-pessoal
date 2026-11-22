-- =====================================================================
-- Planner Diário: banco de dados da família (Supabase / Postgres)
-- Cole TODO este arquivo no "SQL Editor" do Supabase e clique em "Run".
-- =====================================================================
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.familias (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(trim(nome)) between 1 and 80),
  codigo_convite text not null unique default upper(substr(md5(random()::text), 1, 8)),
  criado_por uuid references auth.users(id) on delete set null,
  criado_em timestamptz not null default now()
);

-- Cada pessoa: 1 família, com sua configuração do dia
create table if not exists public.membros (
  familia_id uuid not null references public.familias(id) on delete cascade,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  nome text not null,
  email text,
  papel text not null default 'membro' check (papel in ('administrador', 'membro')),
  inicio_dia time not null default '07:00',
  horas_dia int not null default 16 check (horas_dia between 1 and 24),
  fim_dia time not null default '22:00',               -- horário OBRIGATÓRIO de fechamento do checklist
  fuso text not null default 'America/Sao_Paulo',
  lembrete_min int not null default 15 check (lembrete_min between 0 and 240),
  lembrete_email boolean not null default true,
  lembrete_push boolean not null default true,
  criado_em timestamptz not null default now(),
  primary key (familia_id, user_id)
);

create table if not exists public.atividades (
  id uuid primary key default gen_random_uuid(),
  familia_id uuid not null references public.familias(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  data date not null,
  hora time,
  titulo text not null check (length(trim(titulo)) between 1 and 120),
  observacao text,
  feito boolean not null default false,
  status_pessoal text check (status_pessoal in ('fiz_bem', 'parcial', 'nao_fiz')),
  status_texto text,
  google_event_id text,
  pontos int generated always as ((case when feito then 10 else 0 end) + (case when status_pessoal = 'fiz_bem' then 5 else 0 end)) stored,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists atividades_user_data on public.atividades (user_id, data);
create index if not exists atividades_familia_data on public.atividades (familia_id, data);

create table if not exists public.push_inscricoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  criado_em timestamptz not null default now()
);

-- Controle para não repetir lembretes (usado pela Edge Function)
create table if not exists public.lembretes_enviados (
  chave text primary key,
  enviado_em timestamptz not null default now()
);

-- ---------- Funções auxiliares ----------
create or replace function public.minha_familia() returns uuid
  language sql stable security definer set search_path = public as $$ select familia_id from public.membros where user_id = auth.uid() $$;
create or replace function public.sou_admin() returns boolean
  language sql stable security definer set search_path = public as $$ select exists(select 1 from public.membros where user_id = auth.uid() and papel = 'administrador') $$;

-- Regras das atividades (garantidas no servidor)
create or replace function public.validar_atividade() returns trigger language plpgsql security definer set search_path = public as $$
declare v_hoje date; v_pend date;
begin
  select (now() at time zone coalesce(m.fuso, 'America/Sao_Paulo'))::date into v_hoje from public.membros m where m.user_id = new.user_id;
  v_hoje := coalesce(v_hoje, current_date);
  new.atualizado_em := now();
  if tg_op = 'INSERT' then
    new.familia_id := (select familia_id from public.membros where user_id = new.user_id);
    if new.data < v_hoje then raise exception 'Não é possível criar atividades em dias passados.'; end if;
    select min(data) into v_pend from public.atividades where user_id = new.user_id and data < new.data and status_pessoal is null;
    if v_pend is not null then
      raise exception 'Feche 100%% do checklist de % antes de planejar este dia.', to_char(v_pend, 'DD/MM/YYYY');
    end if;
  else
    if new.user_id <> old.user_id or new.data <> old.data and new.data < v_hoje then raise exception 'Alteração não permitida.'; end if;
  end if;
  return new;
end $$;
drop trigger if exists validar on public.atividades;
create trigger validar before insert or update on public.atividades for each row execute function public.validar_atividade();

-- ---------- RLS ----------
alter table public.familias enable row level security;
alter table public.membros enable row level security;
alter table public.atividades enable row level security;
alter table public.push_inscricoes enable row level security;
alter table public.lembretes_enviados enable row level security; -- sem políticas: só service role

do $$ declare p record; begin
  for p in select policyname, tablename from pg_policies where schemaname = 'public' and tablename in ('familias','membros','atividades','push_inscricoes') loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

create policy familia_ver on public.familias for select to authenticated using (id = public.minha_familia());
create policy familia_editar on public.familias for update to authenticated using (id = public.minha_familia() and public.sou_admin()) with check (id = public.minha_familia());
create policy membros_ver on public.membros for select to authenticated using (familia_id = public.minha_familia());
-- cada um edita a própria configuração (papel é protegido pelo trigger abaixo)
create policy membros_editar_eu on public.membros for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- a família vê as atividades de todos (ranking); só o dono cria/edita/exclui as suas
create policy ativ_ver on public.atividades for select to authenticated using (familia_id = public.minha_familia());
create policy ativ_criar on public.atividades for insert to authenticated with check (user_id = auth.uid());
create policy ativ_editar on public.atividades for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy ativ_excluir on public.atividades for delete to authenticated using (user_id = auth.uid() and data >= current_date);

create policy push_dono on public.push_inscricoes for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.proteger_membro() returns trigger language plpgsql as $$
begin
  if current_setting('planner.rpc', true) is distinct from '1' and (new.papel <> old.papel or new.familia_id <> old.familia_id) then
    raise exception 'Use a área de administração para alterar papéis.';
  end if;
  return new;
end $$;
drop trigger if exists proteger on public.membros;
create trigger proteger before update on public.membros for each row execute function public.proteger_membro();

-- ---------- RPCs da família ----------
create or replace function public.criar_familia(p_nome text, p_meu_nome text) returns public.familias
  language plpgsql security definer set search_path = public as $$
declare f public.familias;
begin
  if auth.uid() is null then raise exception 'Faça login.'; end if;
  if exists(select 1 from public.membros where user_id = auth.uid()) then raise exception 'Você já participa de uma família.'; end if;
  insert into public.familias (nome, criado_por) values (trim(p_nome), auth.uid()) returning * into f;
  insert into public.membros (familia_id, user_id, nome, email, papel)
    values (f.id, auth.uid(), coalesce(nullif(trim(p_meu_nome), ''), 'Eu'), (select email from auth.users where id = auth.uid()), 'administrador');
  return f;
end $$;

create or replace function public.entrar_familia(p_codigo text, p_meu_nome text) returns public.familias
  language plpgsql security definer set search_path = public as $$
declare f public.familias;
begin
  if auth.uid() is null then raise exception 'Faça login.'; end if;
  if exists(select 1 from public.membros where user_id = auth.uid()) then raise exception 'Você já participa de uma família.'; end if;
  select * into f from public.familias where codigo_convite = upper(trim(p_codigo));
  if f.id is null then raise exception 'Código de convite inválido.'; end if;
  insert into public.membros (familia_id, user_id, nome, email)
    values (f.id, auth.uid(), coalesce(nullif(trim(p_meu_nome), ''), 'Membro'), (select email from auth.users where id = auth.uid()));
  return f;
end $$;

create or replace function public.novo_codigo_convite() returns text
  language plpgsql security definer set search_path = public as $$
declare c text := upper(substr(md5(random()::text), 1, 8));
begin
  if not public.sou_admin() then raise exception 'Somente administradores.'; end if;
  update public.familias set codigo_convite = c where id = public.minha_familia();
  return c;
end $$;

create or replace function public.definir_papel(p_user uuid, p_papel text) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if not public.sou_admin() then raise exception 'Somente administradores.'; end if;
  if p_papel = 'membro' and p_user = auth.uid() and (select count(*) from public.membros where familia_id = public.minha_familia() and papel = 'administrador') = 1 then
    raise exception 'A família precisa de pelo menos um administrador.'; end if;
  perform set_config('planner.rpc', '1', true);
  update public.membros set papel = p_papel where user_id = p_user and familia_id = public.minha_familia();
end $$;

create or replace function public.remover_membro(p_user uuid) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if not public.sou_admin() then raise exception 'Somente administradores.'; end if;
  if p_user = auth.uid() then raise exception 'Use "sair da família".'; end if;
  delete from public.membros where user_id = p_user and familia_id = public.minha_familia();
end $$;

-- Ranking mensal da família (p_mes = qualquer dia do mês)
create or replace function public.ranking_mensal(p_mes date) returns table (user_id uuid, nome text, pontos bigint, feitas bigint, total bigint)
  language sql stable security definer set search_path = public as $$
  select m.user_id, m.nome, coalesce(sum(a.pontos), 0), count(a.id) filter (where a.feito), count(a.id)
  from public.membros m
  left join public.atividades a on a.user_id = m.user_id and a.data >= date_trunc('month', p_mes)::date and a.data < (date_trunc('month', p_mes) + interval '1 month')::date
  where m.familia_id = public.minha_familia()
  group by m.user_id, m.nome order by 3 desc, 4 desc
$$;

revoke execute on function public.criar_familia, public.entrar_familia, public.novo_codigo_convite, public.definir_papel, public.remover_membro, public.ranking_mensal from public, anon;
grant execute on function public.criar_familia, public.entrar_familia, public.novo_codigo_convite, public.definir_papel, public.remover_membro, public.ranking_mensal to authenticated;
