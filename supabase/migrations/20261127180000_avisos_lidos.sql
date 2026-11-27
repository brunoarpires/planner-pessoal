-- Estado lido/não lido dos avisos do app (por pessoa). Só o dono lê e grava as próprias linhas.
-- Os avisos em si são calculados no app (órfãos, checklist atrasado, erro do Google); aqui fica só o que já foi visto.
create table if not exists public.avisos_lidos (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  aviso_id text not null,
  assinatura text,
  lido_em timestamptz not null default now(),
  primary key (user_id, aviso_id)
);
alter table public.avisos_lidos enable row level security;

drop policy if exists avisos_lidos_ver on public.avisos_lidos;
create policy avisos_lidos_ver on public.avisos_lidos
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists avisos_lidos_inserir on public.avisos_lidos;
create policy avisos_lidos_inserir on public.avisos_lidos
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists avisos_lidos_atualizar on public.avisos_lidos;
create policy avisos_lidos_atualizar on public.avisos_lidos
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
