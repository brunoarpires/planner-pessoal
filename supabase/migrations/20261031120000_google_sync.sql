-- =====================================================================
-- Planner Diário: sincronização automática com o Google Agenda
-- =====================================================================

-- Configuração privada das Edge Functions (só service role lê; sem políticas RLS)
create table if not exists public.config_privada (chave text primary key, valor text not null);
alter table public.config_privada enable row level security;

-- Refresh token do Google de cada pessoa (NUNCA exposto ao app: sem políticas RLS)
create table if not exists public.google_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  refresh_token text not null,
  conectado_em timestamptz not null default now(),
  ultimo_sync timestamptz,
  erro text
);
alter table public.google_tokens enable row level security;

-- Eventos puxados do Google (cada um vê só os seus)
create table if not exists public.eventos_google (
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id text not null,
  data date not null,
  hora time,
  hora_fim time,
  titulo text not null default '(sem título)',
  primary key (user_id, event_id)
);
alter table public.eventos_google enable row level security;
drop policy if exists eventos_dono on public.eventos_google;
create policy eventos_dono on public.eventos_google for select to authenticated using (user_id = auth.uid());

-- Atividades: marca o que precisa ir para o Google
alter table public.atividades add column if not exists google_sync_pendente boolean not null default true;

create or replace function public.marcar_sync_google() returns trigger language plpgsql as $$
begin
  if (new.titulo, new.hora, new.data, coalesce(new.observacao, ''), new.feito, coalesce(new.status_pessoal, ''))
     is distinct from (old.titulo, old.hora, old.data, coalesce(old.observacao, ''), old.feito, coalesce(old.status_pessoal, '')) then
    new.google_sync_pendente := true;
  end if;
  return new;
end $$;
drop trigger if exists marcar_sync on public.atividades;
create trigger marcar_sync before update on public.atividades for each row execute function public.marcar_sync_google();

-- Exclusões a refletir no Google
create table if not exists public.google_exclusoes (user_id uuid not null, google_event_id text not null, primary key (user_id, google_event_id));
alter table public.google_exclusoes enable row level security;
create or replace function public.registrar_exclusao_google() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.google_event_id is not null then insert into public.google_exclusoes values (old.user_id, old.google_event_id) on conflict do nothing; end if;
  return old;
end $$;
drop trigger if exists exclusao_google on public.atividades;
create trigger exclusao_google after delete on public.atividades for each row execute function public.registrar_exclusao_google();

-- RPCs usadas pelo app (o token nunca volta para o app)
create or replace function public.salvar_google_token(p_refresh text) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or coalesce(p_refresh, '') = '' then return; end if;
  insert into public.google_tokens (user_id, refresh_token) values (auth.uid(), p_refresh)
    on conflict (user_id) do update set refresh_token = excluded.refresh_token, conectado_em = now(), erro = null;
  update public.atividades set google_sync_pendente = true where user_id = auth.uid() and data >= current_date - 1;
end $$;

create or replace function public.status_google() returns table (conectado boolean, conectado_em timestamptz, ultimo_sync timestamptz, erro text)
  language sql stable security definer set search_path = public as $$
  select true, conectado_em, ultimo_sync, erro from public.google_tokens where user_id = auth.uid()
  union all select false, null, null, null where not exists (select 1 from public.google_tokens where user_id = auth.uid())
$$;

create or replace function public.desconectar_google() returns void
  language sql security definer set search_path = public as $$
  delete from public.google_tokens where user_id = auth.uid();
  delete from public.eventos_google where user_id = auth.uid();
$$;

revoke execute on function public.salvar_google_token, public.status_google, public.desconectar_google from public, anon;
grant execute on function public.salvar_google_token, public.status_google, public.desconectar_google to authenticated;
