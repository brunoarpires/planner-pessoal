-- Subcategorias padrão extras em Finanças
insert into public.categorias (pai_id, nome)
select c.id, s from public.categorias c,
  unnest(array['Conta de luz','IPTU','IPVA','Licenciamento carro','Financiamento carro','Internet','Conta celular']) s
where c.nome = 'Finanças' and c.familia_id is null and c.pai_id is null
  and not exists (select 1 from public.categorias x where x.pai_id = c.id and x.nome = s);
