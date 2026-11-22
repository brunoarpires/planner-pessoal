-- Admin pode excluir qualquer categoria/subcategoria (padrão = ocultar só para a família); bloqueia se em uso
create table if not exists public.categorias_ocultas (
  familia_id uuid not null references public.familias(id) on delete cascade,
  categoria_id uuid not null references public.categorias(id) on delete cascade,
  primary key (familia_id, categoria_id)
);
alter table public.categorias_ocultas enable row level security;
drop policy if exists cat_oc_ver on public.categorias_ocultas;
create policy cat_oc_ver on public.categorias_ocultas for select to authenticated using (familia_id = public.minha_familia());

drop policy if exists cat_ver on public.categorias;
create policy cat_ver on public.categorias for select to authenticated using (
  (familia_id is null or familia_id = public.minha_familia())
  and not exists (select 1 from public.categorias_ocultas o where o.familia_id = public.minha_familia()
                  and (o.categoria_id = categorias.id or o.categoria_id = categorias.pai_id)));

drop policy if exists cat_excluir on public.categorias;
create policy cat_excluir on public.categorias for delete to authenticated using (familia_id = public.minha_familia());

-- FKs: impedir exclusão de categoria em uso
alter table public.atividades drop constraint if exists atividades_categoria_id_fkey;
alter table public.atividades drop constraint if exists atividades_subcategoria_id_fkey;
alter table public.atividades add constraint atividades_categoria_id_fkey foreign key (categoria_id) references public.categorias(id) on delete restrict;
alter table public.atividades add constraint atividades_subcategoria_id_fkey foreign key (subcategoria_id) references public.categorias(id) on delete restrict;

create or replace function public.cat_bloquear_em_uso() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  select count(*) into n from public.atividades where categoria_id = old.id or subcategoria_id = old.id
     or categoria_id in (select id from public.categorias where pai_id = old.id)
     or subcategoria_id in (select id from public.categorias where pai_id = old.id);
  if n > 0 then
    raise exception 'Não dá para excluir "%": % atividade(s) usam essa %.', old.nome, n, case when old.pai_id is null then 'categoria' else 'subcategoria' end;
  end if;
  return old;
end $$;
drop trigger if exists cat_bloquear_em_uso on public.categorias;
create trigger cat_bloquear_em_uso before delete on public.categorias for each row execute function public.cat_bloquear_em_uso();

create or replace function public.excluir_categoria(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c public.categorias; f uuid := public.minha_familia(); n int; tipo text;
begin
  select * into c from public.categorias where id = p_id;
  if c.id is null or (c.familia_id is not null and c.familia_id <> f) then raise exception 'Categoria não encontrada.'; end if;
  if c.familia_id is null and not public.sou_admin() then raise exception 'Somente o administrador pode excluir categorias padrão.'; end if;
  tipo := case when c.pai_id is null then 'categoria' else 'subcategoria' end;
  select count(*) into n from public.atividades a where a.familia_id = f and (
    a.categoria_id = p_id or a.subcategoria_id = p_id
    or a.subcategoria_id in (select id from public.categorias where pai_id = p_id));
  if n > 0 then
    raise exception 'Não dá para excluir "%": % % essa %.', c.nome, n, case when n = 1 then 'atividade usa' else 'atividades usam' end, tipo;
  end if;
  if c.familia_id is null then
    insert into public.categorias_ocultas (familia_id, categoria_id) values (f, p_id) on conflict do nothing;
  else
    delete from public.categorias where id = p_id;
  end if;
end $$;
grant execute on function public.excluir_categoria(uuid) to authenticated;
