-- Recorrência: regra + ocorrências geradas como atividades individuais (recorrencia_id)
create table if not exists public.recorrencias (
  id uuid primary key default gen_random_uuid(),
  familia_id uuid not null references public.familias(id) on delete cascade,
  criador uuid not null references auth.users(id) on delete cascade,
  tipo text not null check (tipo in ('horas','diaria','semanal','mensal','anual')),
  intervalo int not null default 1 check (intervalo between 1 and 99),
  dias_semana int[] not null default '{}',
  data_inicio date not null,
  hora text,
  fim_data date,
  fim_qtd int check (fim_qtd between 1 and 500),
  gerado_ate date,
  gerados int not null default 0,
  modelo jsonb not null default '{}', -- titulo, observacao, duracao_min, categoria_id, subcategoria_id, lembrete_canal, participantes, toda_familia
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
alter table public.recorrencias enable row level security;
drop policy if exists rec_ver on public.recorrencias;
create policy rec_ver on public.recorrencias for select to authenticated using (familia_id = public.minha_familia());
drop policy if exists rec_criar on public.recorrencias;
create policy rec_criar on public.recorrencias for insert to authenticated with check (criador = auth.uid() and familia_id = public.minha_familia());
drop policy if exists rec_editar on public.recorrencias;
create policy rec_editar on public.recorrencias for update to authenticated using (criador = auth.uid()) with check (criador = auth.uid());
drop policy if exists rec_excluir on public.recorrencias;
create policy rec_excluir on public.recorrencias for delete to authenticated using (criador = auth.uid());

alter table public.atividades add column if not exists recorrencia_id uuid references public.recorrencias(id) on delete set null;
create index if not exists atividades_recorrencia on public.atividades (recorrencia_id, data);

-- Liga as cópias de uma compartilhada (criada pelo próprio usuário) à recorrência.
create or replace function public.vincular_recorrencia(p_grupo uuid, p_rec uuid) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.atividade_grupos where id = p_grupo and criador = auth.uid())
     or not exists (select 1 from public.recorrencias where id = p_rec and criador = auth.uid()) then
    raise exception 'Sem permissão.'; end if;
  update public.atividades set recorrencia_id = p_rec where grupo_id = p_grupo;
end $$;
revoke execute on function public.vincular_recorrencia from public, anon;
grant execute on function public.vincular_recorrencia to authenticated;
