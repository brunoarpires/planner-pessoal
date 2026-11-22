-- Categorias e subcategorias (padrão global + personalizadas por família)
create table if not exists public.categorias (
  id uuid primary key default gen_random_uuid(),
  familia_id uuid references public.familias(id) on delete cascade, -- null = padrão
  pai_id uuid references public.categorias(id) on delete cascade,   -- null = categoria; preenchido = subcategoria
  nome text not null check (length(trim(nome)) between 1 and 40),
  emoji text, cor text,
  ordem int not null default 100,
  criado_em timestamptz not null default now()
);
create index if not exists categorias_familia on public.categorias (familia_id);
create index if not exists categorias_pai on public.categorias (pai_id);
alter table public.categorias enable row level security;
create policy cat_ver on public.categorias for select to authenticated using (familia_id is null or familia_id = public.minha_familia());
create policy cat_criar on public.categorias for insert to authenticated with check (familia_id = public.minha_familia());
create policy cat_editar on public.categorias for update to authenticated using (familia_id = public.minha_familia()) with check (familia_id = public.minha_familia());
create policy cat_excluir on public.categorias for delete to authenticated using (familia_id = public.minha_familia());

alter table public.atividades add column if not exists categoria_id uuid references public.categorias(id) on delete set null;
alter table public.atividades add column if not exists subcategoria_id uuid references public.categorias(id) on delete set null;

-- seed padrão
do $$
declare c record; pid uuid; s text; i int := 0;
begin
  if exists (select 1 from public.categorias where familia_id is null) then return; end if;
  for c in select * from (values
    ('Saúde','🩺','#ef4444', array['Tomar remédio','Consulta médica','Exame','Dentista','Terapia']),
    ('Exercício','🏃','#f97316', array['Academia','Caminhada','Corrida','Alongamento']),
    ('Trabalho','💼','#3b82f6', array['Reunião','Tarefa','E-mail','Projeto']),
    ('Estudos','📚','#8b5cf6', array['Aula','Leitura','Curso','Revisão']),
    ('Casa','🏠','#14b8a6', array['Limpeza','Compras','Cozinhar','Manutenção','Contas']),
    ('Finanças','💰','#22c55e', array['Pagar conta','Investir','Organizar gastos']),
    ('Família','👨‍👩‍👧','#ec4899', array['Filhos','Escola','Passeio','Visita']),
    ('Lazer','🎉','#eab308', array['Filme','Hobby','Viagem','Descanso']),
    ('Espiritual/Bem-estar','🧘','#06b6d4', array['Meditação','Oração']),
    ('Pessoal','🙂','#64748b', array['Cuidados pessoais','Sono'])
  ) v(nome, emoji, cor, subs) loop
    i := i + 1;
    insert into public.categorias (nome, emoji, cor, ordem) values (c.nome, c.emoji, c.cor, i) returning id into pid;
    foreach s in array c.subs loop insert into public.categorias (pai_id, nome) values (pid, s); end loop;
  end loop;
end $$;
